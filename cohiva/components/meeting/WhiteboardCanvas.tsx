"use client";

import {
  Excalidraw,
  exportToBlob,
} from "@excalidraw/excalidraw";

import type {
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import type {
  ExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";

import {
  useCall,
} from "@stream-io/video-react-sdk";

import type {
  CustomVideoEvent,
  StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import "@excalidraw/excalidraw/index.css";

/* =========================================================
   TYPES
========================================================= */

type WhiteboardCanvasProps = {
  callId: string;

  /*
   * Whether Whiteboard is the
   * currently visible meeting tab.
   */
  active: boolean;
};

type WhiteboardTool =
  | "pen"
  | "highlighter"
  | "eraser";

type IncomingBatch = {
  chunks: string[];
  total: number;
  snapshot: boolean;
};

type CohivaPermissions = {
  studentMic?: boolean;
  studentCamera?: boolean;
  studentScreenShare?: boolean;
  studentRecording?: boolean;
  studentWhiteboard?: boolean;
};

/* =========================================================
   CONFIG
========================================================= */

const WHITEBOARD_EVENT =
  "cohiva-whiteboard";

const CHUNK_SIZE_BYTES =
  3000;

const DRAW_SYNC_DELAY =
  120;

const SAVE_DELAY =
  1500;

/* =========================================================
   HELPERS
========================================================= */

const splitIntoChunks = (
  value: string
) => {
  const encoder =
    new TextEncoder();

  const decoder =
    new TextDecoder();

  const bytes =
    encoder.encode(
      value
    );

  const chunks:
    string[] = [];

  let offset =
    0;

  while (
    offset <
    bytes.length
  ) {
    let end =
      Math.min(
        offset +
          CHUNK_SIZE_BYTES,
        bytes.length
      );

    /*
     * Never split in the middle of a UTF-8 sequence. Keeping
     * chunks byte-bounded lets each Stream custom event carry
     * much more data than the old 900-character chunks while
     * staying safely under the server's 4.5 KB event limit.
     */
    if (
      end <
      bytes.length
    ) {
      while (
        end > offset &&
        (
          bytes[end] &
          0b1100_0000
        ) ===
          0b1000_0000
      ) {
        end -=
          1;
      }
    }

    if (
      end ===
      offset
    ) {
      end =
        Math.min(
          offset +
            CHUNK_SIZE_BYTES,
          bytes.length
        );
    }

    chunks.push(
      decoder.decode(
        bytes.slice(
          offset,
          end
        )
      )
    );

    offset =
      end;
  }

  return chunks;
};

/* =========================================================
   READ WHITEBOARD PERMISSION
========================================================= */

const readStudentWhiteboardPermission =
  (
    custom:
      Record<
        string,
        unknown
      > |
      undefined |
      null
  ) => {
    const permissions =
      custom
        ?.cohiva_permissions as
        | CohivaPermissions
        | undefined;

    return (
      permissions
        ?.studentWhiteboard ===
      true
    );
  };

/* =========================================================
   STORED BOARD PARSER
========================================================= */

const readStoredElements = (
  result: any
): ExcalidrawElement[] | null => {
  const candidates = [
    result?.elements,

    result?.state
      ?.elements,

    result?.whiteboard
      ?.elements,

    result?.data
      ?.elements,

    result?.board,
  ];

  for (
    const candidate of
      candidates
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      return candidate as
        ExcalidrawElement[];
    }

    if (
      typeof candidate ===
      "string"
    ) {
      try {
        const parsed =
          JSON.parse(
            candidate
          );

        if (
          Array.isArray(
            parsed
          )
        ) {
          return parsed as
            ExcalidrawElement[];
        }

        if (
          Array.isArray(
            parsed
              ?.elements
          )
        ) {
          return parsed
            .elements as
            ExcalidrawElement[];
        }
      } catch {
        /*
         * Ignore old /
         * incompatible data.
         */
      }
    }
  }

  return null;
};

/* =========================================================
   COMPONENT
========================================================= */

const WhiteboardCanvas = ({
  callId,
  active,
}: WhiteboardCanvasProps) => {
  const call =
    useCall();

  const isTeacher =
    Boolean(
      call?.isCreatedByMe
    );

  /* =====================================================
     PERMISSION STATE

     VERY IMPORTANT:

     Students ALWAYS start locked.

     We never infer permission from
     cached React state during startup.
  ===================================================== */

  const [
    permissionReady,
    setPermissionReady,
  ] =
    useState(
      isTeacher
    );

  const [
    studentDrawingAllowed,
    setStudentDrawingAllowed,
  ] =
    useState(false);

  /*
   * Teacher can always edit.
   *
   * Student can edit ONLY after:
   *
   * permissionReady === true
   *
   * AND
   *
   * studentDrawingAllowed === true
   */
  const canEdit =
    isTeacher ||
    (
      active &&
      permissionReady &&
      studentDrawingAllowed
    );

  /*
   * Student view-only mode.
   *
   * When true we keep Excalidraw mounted so realtime
   * updates, panning and zooming continue to work, but
   * we remove drawing/editing controls from the UI.
   */
  const studentViewOnly =
    !isTeacher &&
    !canEdit;

  /* =====================================================
     REFS
  ===================================================== */

  const apiRef =
    useRef<
      ExcalidrawImperativeAPI | null
    >(
      null
    );

  const applyingRemoteRef =
    useRef(false);

  const lastSentVersionsRef =
    useRef<
      Map<
        string,
        number
      >
    >(
      new Map()
    );

  const incomingBatchesRef =
    useRef<
      Map<
        string,
        IncomingBatch
      >
    >(
      new Map()
    );

  const syncTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(
      null
    );

  const persistTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(
      null
    );

  const syncTimeoutRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(
      null
    );

  /*
   * Prevent older permission
   * requests from winning after a
   * newer request was started.
   */
  const permissionRequestRef =
    useRef(0);

  /*
   * Only load persistent board
   * once per whiteboard mount.
   */
  const boardLoadedRef =
    useRef(false);

  /* =====================================================
     UI STATE
  ===================================================== */

  const [
    activeTool,
    setActiveTool,
  ] =
    useState<WhiteboardTool>(
      "pen"
    );

  const [
    initialBoardLoaded,
    setInitialBoardLoaded,
  ] =
    useState(false);

  const [
    syncing,
    setSyncing,
  ] =
    useState(false);

  const [
    saveState,
    setSaveState,
  ] =
    useState<
      | "idle"
      | "saving"
      | "saved"
      | "error"
    >(
      "idle"
    );

  const [
    syncError,
    setSyncError,
  ] =
    useState("");

  /* =====================================================
     HARD LOCK STUDENT
  ===================================================== */

  const hardLockStudent =
    useCallback(
      () => {
        if (
          isTeacher
        ) {
          return;
        }

        setPermissionReady(
          false
        );

        setStudentDrawingAllowed(
          false
        );

        const api =
          apiRef.current;

        if (api) {
          api.setActiveTool({
            type:
              "hand",
          });
        }
      },
      [
        isTeacher,
      ]
    );

  /* =====================================================
     PRE-PAINT STUDENT LOCK

     useEffect runs after the browser may paint.
     useLayoutEffect runs before that paint is shown.

     Every time the board becomes hidden or visible,
     students discard the previous permission result and
     start locked. A fresh authoritative permission check
     may unlock them only after the board is opened.
  ===================================================== */

  useLayoutEffect(() => {
    if (
      isTeacher
    ) {
      return;
    }

    /*
     * Invalidate any permission request from the previous
     * whiteboard-open cycle.
     */
    permissionRequestRef.current +=
      1;

    setPermissionReady(
      false
    );

    setStudentDrawingAllowed(
      false
    );

    const api =
      apiRef.current;

    if (api) {
      api.setActiveTool({
        type:
          "hand",
      });
    }
  }, [
    active,
    isTeacher,
  ]);

  /* =====================================================
     AUTHORITATIVE PERMISSION REFRESH

     This uses call.get().

     It does NOT trust cached custom
     hook state for the initial unlock.
  ===================================================== */

  const refreshWhiteboardPermission =
    useCallback(
      async (
        lockFirst:
          boolean
      ) => {
        if (
          !call
        ) {
          return;
        }

        /*
         * Unique ID for this request.
         *
         * Older responses are ignored.
         */
        const requestId =
          ++permissionRequestRef.current;

        if (
          lockFirst &&
          !isTeacher
        ) {
          hardLockStudent();
        }

        try {
          const response =
            await call.get();

          /*
           * A newer permission request
           * already started.
           */
          if (
            requestId !==
            permissionRequestRef.current
          ) {
            return;
          }

          const custom =
            (
              response.call
                .custom ??
              {}
            ) as Record<
              string,
              unknown
            >;

          const allowed =
            readStudentWhiteboardPermission(
              custom
            );

          setStudentDrawingAllowed(
            allowed
          );

          setPermissionReady(
            true
          );
        } catch (
          permissionError
        ) {
          console.error(
            "Whiteboard permission refresh error:",
            permissionError
          );

          /*
           * Security / permission
           * failure always fails closed.
           */
          if (
            !isTeacher
          ) {
            setStudentDrawingAllowed(
              false
            );

            setPermissionReady(
              true
            );
          }
        }
      },
      [
        call,
        hardLockStudent,
        isTeacher,
      ]
    );

  /* =====================================================
     AUTHORITATIVE PERMISSION CHECK ON OPEN

     Student sequence:

       Board clicked
           ↓
       useLayoutEffect locks before browser paint
           ↓
       call.get() fetches latest permission
           ↓
       explicit true → unlock
       false / missing / error → remain view-only
  ===================================================== */

  useEffect(() => {
    if (
      !active ||
      !call
    ) {
      return;
    }

    /*
     * Teacher always edits. We still refresh so the
     * toolbar badge reflects whether students may draw.
     */
    if (
      isTeacher
    ) {
      void refreshWhiteboardPermission(
        false
      );

      return;
    }

    /*
     * Student has already been locked before paint by the
     * layout effect. Only the authoritative result can
     * unlock drawing.
     */
    void refreshWhiteboardPermission(
      false
    );
  }, [
    active,
    call,
    isTeacher,
    refreshWhiteboardPermission,
  ]);

  /* =====================================================
     LIVE PERMISSION UPDATES

     Teacher changes:

       Settings
           ↓
       call.update()
           ↓
       Stream call.updated
           ↓
       student updates immediately

     We use event custom data directly
     when available.

     We DO NOT use old cached custom
     state to unlock during startup.
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "call.updated",
        (
          event:
            StreamVideoEvent
        ) => {
          /*
           * Whiteboard is hidden.
           *
           * Never preserve an old "allowed" state for a
           * student. The next opening must begin locked and
           * perform a fresh authoritative permission check.
           */
          if (
            !active
          ) {
            if (
              !isTeacher
            ) {
              hardLockStudent();
            }

            return;
          }

          const updatedCall =
            (
              event as any
            )?.call;

          const eventCustom =
            updatedCall
              ?.custom as
              | Record<
                  string,
                  unknown
                >
              | undefined;

          if (
            eventCustom
          ) {
            const permissions =
              eventCustom
                .cohiva_permissions as
                | CohivaPermissions
                | undefined;

            const value =
              permissions
                ?.studentWhiteboard;

            if (
              typeof value ===
              "boolean"
            ) {
              /*
               * Invalidate any older
               * call.get() request.
               */
              permissionRequestRef.current +=
                1;

              setStudentDrawingAllowed(
                value
              );

              setPermissionReady(
                true
              );

              if (
                !value &&
                !isTeacher
              ) {
                const api =
                  apiRef.current;

                if (
                  api
                ) {
                  api.setActiveTool({
                    type:
                      "hand",
                  });
                }
              }

              return;
            }
          }

          /*
           * If event payload did not
           * contain custom data, fetch
           * authoritative state.
           */
          void refreshWhiteboardPermission(
            false
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    active,
    isTeacher,
    hardLockStudent,
    refreshWhiteboardPermission,
  ]);

  /* =====================================================
     ACTIVE TOOL FROM PERMISSION
  ===================================================== */

  useEffect(() => {
    const api =
      apiRef.current;

    if (
      !api
    ) {
      return;
    }

    if (
      !canEdit
    ) {
      api.setActiveTool({
        type:
          "hand",
      });

      return;
    }

    setActiveTool(
      "pen"
    );

    api.updateScene({
      appState: {
        currentItemStrokeColor:
          "#202020",

        currentItemOpacity:
          100,

        currentItemStrokeWidth:
          2,
      },
    });

    api.setActiveTool({
      type:
        "freedraw",
    });
  }, [
    canEdit,
  ]);

  /* =====================================================
     SERVER RELAY
  ===================================================== */

  const relayWhiteboardEvents =
    useCallback(
      async (
        events:
          Record<
            string,
            unknown
          >[]
      ) => {
        if (
          events.length ===
          0
        ) {
          return;
        }

        const response =
          await fetch(
            "/api/meetings/whiteboard-event",
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  callId,
                  events,
                }),
            }
          );

        const result =
          await response
            .json()
            .catch(
              () =>
                null
            );

        if (
          !response.ok
        ) {
          throw new Error(
            result?.error ||
              "Unable to relay whiteboard update."
          );
        }
      },
      [
        callId,
      ]
    );

  /* =====================================================
     SEND ELEMENTS
  ===================================================== */

  const sendElements =
    useCallback(
      async (
        elements:
          readonly ExcalidrawElement[],

        snapshot =
          false
      ) => {
        if (
          elements.length ===
          0
        ) {
          return;
        }

        const serialized =
          JSON.stringify(
            elements
          );

        const chunks =
          splitIntoChunks(
            serialized
          );

        const batchId =
          crypto.randomUUID();

        const events =
          chunks.map(
            (
              chunk,
              index
            ) => ({
              action:
                "elements",

              batchId,

              index,

              total:
                chunks.length,

              snapshot,

              data:
                chunk,
            })
          );

        await relayWhiteboardEvents(
          events
        );
      },
      [
        relayWhiteboardEvents,
      ]
    );

  /* =====================================================
     PERSIST BOARD
  ===================================================== */

  const persistBoard =
    useCallback(
      async () => {
        if (
          !isTeacher
        ) {
          return;
        }

        const api =
          apiRef.current;

        if (
          !api
        ) {
          return;
        }

        try {
          setSaveState(
            "saving"
          );

          /*
           * Persist only the current visible scene. Deleted tombstones
           * are useful for realtime reconciliation but do not need to
           * live forever in MongoDB. This keeps saved boards smaller and
           * faster to load as a class progresses.
           */
          const elements =
            api.getSceneElements();

          const response =
            await fetch(
              "/api/meetings/whiteboard-state",
              {
                method:
                  "PUT",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    callId,
                    elements,
                  }),
              }
            );

          const result =
            await response
              .json()
              .catch(
                () =>
                  null
              );

          if (
            !response.ok
          ) {
            throw new Error(
              result?.error ||
                "Unable to save whiteboard."
            );
          }

          setSaveState(
            "saved"
          );

          window.setTimeout(
            () => {
              setSaveState(
                "idle"
              );
            },
            1500
          );
        } catch (
          saveError
        ) {
          console.error(
            "Whiteboard persistence error:",
            saveError
          );

          setSaveState(
            "error"
          );
        }
      },
      [
        callId,
        isTeacher,
      ]
    );

  /* =====================================================
     SCHEDULE PERSISTENCE
  ===================================================== */

  const schedulePersist =
    useCallback(
      () => {
        if (
          !isTeacher
        ) {
          return;
        }

        if (
          persistTimerRef.current
        ) {
          clearTimeout(
            persistTimerRef.current
          );
        }

        persistTimerRef.current =
          setTimeout(
            () => {
              void persistBoard();
            },
            SAVE_DELAY
          );
      },
      [
        isTeacher,
        persistBoard,
      ]
    );

  /* =====================================================
     LOAD PERSISTED BOARD

     Optimized:
     don't load the whiteboard database
     until the board is actually opened.
  ===================================================== */

  useEffect(() => {
    if (
      !active ||
      boardLoadedRef.current
    ) {
      return;
    }

    boardLoadedRef.current =
      true;

    let cancelled =
      false;

    const loadBoard =
      async () => {
        try {
          const response =
            await fetch(
              `/api/meetings/whiteboard-state?callId=${encodeURIComponent(
                callId
              )}`,
              {
                cache:
                  "no-store",
              }
            );

          if (
            !response.ok
          ) {
            return;
          }

          const result =
            await response.json();

          const elements =
            readStoredElements(
              result
            );

          if (
            cancelled ||
            !elements ||
            !apiRef.current
          ) {
            return;
          }

          applyingRemoteRef.current =
            true;

          apiRef.current.updateScene({
            elements,
          });

          elements.forEach(
            (
              element
            ) => {
              lastSentVersionsRef.current.set(
                element.id,
                element.version
              );
            }
          );

          requestAnimationFrame(
            () => {
              applyingRemoteRef.current =
                false;
            }
          );
        } catch (
          loadError
        ) {
          console.error(
            "Whiteboard load error:",
            loadError
          );
        } finally {
          if (
            !cancelled
          ) {
            setInitialBoardLoaded(
              true
            );
          }
        }
      };

    const timer =
      window.setTimeout(
        () => {
          void loadBoard();
        },
        100
      );

    return () => {
      cancelled =
        true;

      clearTimeout(
        timer
      );
    };
  }, [
    active,
    callId,
  ]);

  /* =====================================================
     SEND FULL SNAPSHOT
  ===================================================== */

  const sendFullSnapshot =
    useCallback(
      async () => {
        if (
          !isTeacher
        ) {
          return;
        }

        const api =
          apiRef.current;

        if (
          !api
        ) {
          return;
        }

        const elements =
          api.getSceneElementsIncludingDeleted();

        if (
          elements.length ===
          0
        ) {
          await relayWhiteboardEvents([
            {
              action:
                "empty-snapshot",
            },
          ]);

          return;
        }

        await sendElements(
          elements,
          true
        );
      },
      [
        isTeacher,
        relayWhiteboardEvents,
        sendElements,
      ]
    );

  /* =====================================================
     APPLY REMOTE ELEMENTS
  ===================================================== */

  const applyRemoteElements =
    useCallback(
      (
        remoteElements:
          ExcalidrawElement[],

        snapshot:
          boolean
      ) => {
        const api =
          apiRef.current;

        if (
          !api
        ) {
          return;
        }

        applyingRemoteRef.current =
          true;

        remoteElements.forEach(
          (
            element
          ) => {
            lastSentVersionsRef.current.set(
              element.id,
              element.version
            );
          }
        );

        if (
          snapshot
        ) {
          api.updateScene({
            elements:
              remoteElements,
          });
        } else {
          const localElements =
            api.getSceneElementsIncludingDeleted();

          const map =
            new Map<
              string,
              ExcalidrawElement
            >();

          localElements.forEach(
            (
              element
            ) => {
              map.set(
                element.id,
                element
              );
            }
          );

          remoteElements.forEach(
            (
              incoming
            ) => {
              const existing =
                map.get(
                  incoming.id
                );

              if (
                !existing ||
                incoming.version >=
                  existing.version
              ) {
                map.set(
                  incoming.id,
                  incoming
                );
              }
            }
          );

          api.updateScene({
            elements:
              Array.from(
                map.values()
              ),
          });
        }

        /*
         * Student edits received by the
         * teacher become part of the
         * persistent authoritative board.
         */
        if (
          isTeacher
        ) {
          window.setTimeout(
            () => {
              schedulePersist();
            },
            50
          );
        }

        requestAnimationFrame(
          () => {
            applyingRemoteRef.current =
              false;
          }
        );
      },
      [
        isTeacher,
        schedulePersist,
      ]
    );

  /* =====================================================
     REALTIME WHITEBOARD EVENTS
  ===================================================== */

  useEffect(() => {
    if (
      !call
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const payload =
            (
              event as
                CustomVideoEvent
            ).custom as
              Record<
                string,
                unknown
              >;

          if (
            payload.type !==
            WHITEBOARD_EVENT
          ) {
            return;
          }

          const action =
            payload.action;

          /* ===========================================
             ELEMENT CHUNKS
          =========================================== */

          if (
            action ===
            "elements"
          ) {
            const {
              batchId,
              index,
              total,
              data,
              snapshot,
            } =
              payload;

            if (
              typeof batchId !==
                "string" ||
              typeof index !==
                "number" ||
              typeof total !==
                "number" ||
              typeof data !==
                "string"
            ) {
              return;
            }

            let batch =
              incomingBatchesRef.current.get(
                batchId
              );

            if (
              !batch
            ) {
              batch = {
                chunks:
                  new Array(
                    total
                  ),

                total,

                snapshot:
                  snapshot ===
                  true,
              };

              incomingBatchesRef.current.set(
                batchId,
                batch
              );

              window.setTimeout(
                () => {
                  incomingBatchesRef.current.delete(
                    batchId
                  );
                },
                15000
              );
            }

            batch.chunks[
              index
            ] =
              data;

            const received =
              batch.chunks.reduce(
                (
                  count,
                  value
                ) =>
                  value
                    ? count +
                      1
                    : count,
                0
              );

            if (
              received !==
              batch.total
            ) {
              return;
            }

            try {
              const elements =
                JSON.parse(
                  batch.chunks.join(
                    ""
                  )
                ) as
                  ExcalidrawElement[];

              applyRemoteElements(
                elements,
                batch.snapshot
              );

              incomingBatchesRef.current.delete(
                batchId
              );

              setSyncing(
                false
              );

              setSyncError(
                ""
              );

              if (
                syncTimeoutRef.current
              ) {
                clearTimeout(
                  syncTimeoutRef.current
                );

                syncTimeoutRef.current =
                  null;
              }
            } catch (
              parseError
            ) {
              console.error(
                "Whiteboard parse error:",
                parseError
              );
            }

            return;
          }

          /* ===========================================
             STUDENT ASKS FOR TEACHER BOARD
          =========================================== */

          if (
            action ===
              "sync-request" &&
            isTeacher
          ) {
            void sendFullSnapshot();

            return;
          }

          /* ===========================================
             EMPTY BOARD
          =========================================== */

          if (
            action ===
            "empty-snapshot"
          ) {
            if (
              isTeacher
            ) {
              return;
            }

            const api =
              apiRef.current;

            if (
              !api
            ) {
              return;
            }

            applyingRemoteRef.current =
              true;

            api.resetScene();

            lastSentVersionsRef.current.clear();

            requestAnimationFrame(
              () => {
                applyingRemoteRef.current =
                  false;

                setSyncing(
                  false
                );
              }
            );

            return;
          }

          /* ===========================================
             CLEAR BOARD
          =========================================== */

          if (
            action ===
            "clear"
          ) {
            const api =
              apiRef.current;

            if (
              !api
            ) {
              return;
            }

            applyingRemoteRef.current =
              true;

            api.resetScene();

            lastSentVersionsRef.current.clear();

            requestAnimationFrame(
              () => {
                applyingRemoteRef.current =
                  false;
              }
            );
          }
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    isTeacher,
    applyRemoteElements,
    sendFullSnapshot,
  ]);

  /* =====================================================
     STUDENT INITIAL SYNC

     Happens only after the student
     actually opens Whiteboard.
  ===================================================== */

  useEffect(() => {
    if (
      !active ||
      !call ||
      isTeacher ||
      !initialBoardLoaded
    ) {
      return;
    }

    setSyncing(
      true
    );

    setSyncError(
      ""
    );

    const timer =
      window.setTimeout(
        () => {
          void relayWhiteboardEvents([
            {
              action:
                "sync-request",
            },
          ]).catch(
            (
              syncRequestError
            ) => {
              console.error(
                "Whiteboard sync request error:",
                syncRequestError
              );

              setSyncing(
                false
              );

              setSyncError(
                "Unable to sync the board."
              );
            }
          );
        },
        200
      );

    syncTimeoutRef.current =
      setTimeout(
        () => {
          setSyncing(
            false
          );
        },
        5000
      );

    return () => {
      clearTimeout(
        timer
      );
    };
  }, [
    active,
    call,
    isTeacher,
    initialBoardLoaded,
    relayWhiteboardEvents,
  ]);

  /* =====================================================
     SEND LOCAL CHANGES
  ===================================================== */

  const sendLocalChanges =
    useCallback(
      async () => {
        if (
          !canEdit ||
          (
            !isTeacher &&
            !permissionReady
          ) ||
          applyingRemoteRef.current
        ) {
          return;
        }

        const api =
          apiRef.current;

        if (
          !api
        ) {
          return;
        }

        const allElements =
          api.getSceneElementsIncludingDeleted();

        const changed =
          allElements.filter(
            (
              element
            ) => {
              const last =
                lastSentVersionsRef.current.get(
                  element.id
                ) ??
                -1;

              return (
                element.version >
                last
              );
            }
          );

        if (
          changed.length ===
          0
        ) {
          return;
        }

        try {
          await sendElements(
            changed,
            false
          );

          /*
           * Mark sent only after
           * server accepts it.
           */
          changed.forEach(
            (
              element
            ) => {
              lastSentVersionsRef.current.set(
                element.id,
                element.version
              );
            }
          );

          if (
            isTeacher
          ) {
            schedulePersist();
          }
        } catch (
          relayError
        ) {
          console.error(
            "Whiteboard relay error:",
            relayError
          );

          setSyncError(
            "Realtime whiteboard connection was interrupted."
          );

          /*
           * If a student got a 403
           * because teacher disabled
           * editing, fail closed again.
           */
          if (
            !isTeacher
          ) {
            hardLockStudent();

            void refreshWhiteboardPermission(
              false
            );
          }
        }
      },
      [
        canEdit,
        isTeacher,
        permissionReady,
        sendElements,
        schedulePersist,
        hardLockStudent,
        refreshWhiteboardPermission,
      ]
    );

  /* =====================================================
     CHANGE HANDLER
  ===================================================== */

  const handleChange =
    () => {
      if (
        !canEdit ||
        (
          !isTeacher &&
          !permissionReady
        ) ||
        applyingRemoteRef.current
      ) {
        return;
      }

      if (
        syncTimerRef.current
      ) {
        clearTimeout(
          syncTimerRef.current
        );
      }

      syncTimerRef.current =
        setTimeout(
          () => {
            void sendLocalChanges();
          },
          DRAW_SYNC_DELAY
        );
    };

  /* =====================================================
     CLEANUP
  ===================================================== */

  useEffect(
    () => {
      return () => {
        if (
          syncTimerRef.current
        ) {
          clearTimeout(
            syncTimerRef.current
          );
        }

        if (
          persistTimerRef.current
        ) {
          clearTimeout(
            persistTimerRef.current
          );
        }

        if (
          syncTimeoutRef.current
        ) {
          clearTimeout(
            syncTimeoutRef.current
          );
        }
      };
    },
    []
  );

  /* =====================================================
     PEN
  ===================================================== */

  const usePen =
    () => {
      if (
        !canEdit ||
        (
          !isTeacher &&
          !permissionReady
        )
      ) {
        return;
      }

      const api =
        apiRef.current;

      if (
        !api
      ) {
        return;
      }

      setActiveTool(
        "pen"
      );

      api.updateScene({
        appState: {
          currentItemStrokeColor:
            "#202020",

          currentItemOpacity:
            100,

          currentItemStrokeWidth:
            2,
        },
      });

      api.setActiveTool({
        type:
          "freedraw",
      });
    };

  /* =====================================================
     HIGHLIGHTER
  ===================================================== */

  const useHighlighter =
    () => {
      if (
        !canEdit ||
        (
          !isTeacher &&
          !permissionReady
        )
      ) {
        return;
      }

      const api =
        apiRef.current;

      if (
        !api
      ) {
        return;
      }

      setActiveTool(
        "highlighter"
      );

      api.updateScene({
        appState: {
          currentItemStrokeColor:
            "#FACC15",

          currentItemOpacity:
            35,

          currentItemStrokeWidth:
            4,
        },
      });

      api.setActiveTool({
        type:
          "freedraw",
      });
    };

  /* =====================================================
     ERASER
  ===================================================== */

  const useEraser =
    () => {
      if (
        !canEdit ||
        (
          !isTeacher &&
          !permissionReady
        )
      ) {
        return;
      }

      const api =
        apiRef.current;

      if (
        !api
      ) {
        return;
      }

      setActiveTool(
        "eraser"
      );

      api.setActiveTool({
        type:
          "eraser",
      });
    };

  /* =====================================================
     CLEAR
  ===================================================== */

  const clearBoard =
    async () => {
      if (
        !isTeacher
      ) {
        return;
      }

      const api =
        apiRef.current;

      if (
        !api
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Clear the entire Cohiva whiteboard for everyone?"
        );

      if (
        !confirmed
      ) {
        return;
      }

      applyingRemoteRef.current =
        true;

      api.resetScene();

      lastSentVersionsRef.current.clear();

      requestAnimationFrame(
        () => {
          applyingRemoteRef.current =
            false;
        }
      );

      try {
        await relayWhiteboardEvents([
          {
            action:
              "clear",
          },
        ]);

        await persistBoard();
      } catch (
        clearError
      ) {
        console.error(
          "Whiteboard clear error:",
          clearError
        );
      }
    };

  /* =====================================================
     EXPORT PNG
  ===================================================== */

  const saveBoard =
    async () => {
      const api =
        apiRef.current;

      if (
        !api
      ) {
        return;
      }

      try {
        const blob =
          await exportToBlob({
            elements:
              api.getSceneElements(),

            appState: {
              ...api.getAppState(),

              exportBackground:
                true,

              viewBackgroundColor:
                "#FFFFFF",
            },

            files:
              api.getFiles(),

            mimeType:
              "image/png",
          });

        const url =
          URL.createObjectURL(
            blob
          );

        const link =
          document.createElement(
            "a"
          );

        link.href =
          url;

        link.download =
          `cohiva-whiteboard-${callId}.png`;

        document.body.appendChild(
          link
        );

        link.click();

        document.body.removeChild(
          link
        );

        window.setTimeout(
          () => {
            URL.revokeObjectURL(
              url
            );
          },
          1000
        );
      } catch (
        exportError
      ) {
        console.error(
          "Whiteboard export error:",
          exportError
        );
      }
    };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">

      {/* =================================================
          TOOLBAR
      ================================================= */}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#403A35]/10 bg-[#FFF7EB] px-3 py-3 sm:px-4">

        <div
          className={`mr-1 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] ${
            isTeacher
              ? "bg-[#CC3A63]/10 text-[#CC3A63]"
              : "bg-[#A2AB73]/15 text-[#737C4C]"
          }`}
        >
          {isTeacher
            ? "Teacher"
            : "Student"}
        </div>

        {/*
         * Editing tools are only visible to:
         * - the teacher, or
         * - a student whose drawing permission is explicitly allowed.
         *
         * View-only students should not see disabled drawing controls.
         */}
        {(isTeacher || canEdit) && (
          <>
            <button
              type="button"
              onClick={
                usePen
              }
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTool ===
                "pen"
                  ? "bg-[#403A35] text-white"
                  : "bg-white text-[#403A35]"
              }`}
            >
              ✏ Pen
            </button>

            <button
              type="button"
              onClick={
                useHighlighter
              }
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTool ===
                "highlighter"
                  ? "bg-[#FACC15] text-[#403A35]"
                  : "bg-white text-[#403A35]"
              }`}
            >
              🖍 Highlighter
            </button>

            <button
              type="button"
              onClick={
                useEraser
              }
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                activeTool ===
                "eraser"
                  ? "bg-[#CC3A63] text-white"
                  : "bg-white text-[#403A35]"
              }`}
            >
              ⌫ Eraser
            </button>
          </>
        )}

        <button
          type="button"
          onClick={
            saveBoard
          }
          className="rounded-xl bg-[#A2AB73]/15 px-3 py-2 text-sm font-bold text-[#737C4C]"
        >
          ↓ PNG
        </button>

        {isTeacher && (
          <button
            type="button"
            onClick={() =>
              void clearBoard()
            }
            className="rounded-xl bg-[#CC3A63]/10 px-3 py-2 text-sm font-bold text-[#CC3A63]"
          >
            🧹 Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">

          {/* STUDENT CHECKING */}

          {!isTeacher &&
            !permissionReady && (
            <div className="rounded-xl bg-[#F9F0E0] px-3 py-2 text-[10px] font-black text-[#756E64]">
              🔐 Checking access...
            </div>
          )}

          {/* STUDENT RESULT */}

          {!isTeacher &&
            permissionReady && (
            <div
              className={`rounded-xl px-3 py-2 text-[10px] font-black ${
                canEdit
                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                  : "bg-[#403A35]/10 text-[#756E64]"
              }`}
            >
              {canEdit
                ? "✏ You can draw"
                : "🔒 View only"}
            </div>
          )}

          {/* TEACHER STATUS */}

          {isTeacher && (
            <div
              className={`rounded-xl px-3 py-2 text-[10px] font-black ${
                studentDrawingAllowed
                  ? "bg-[#A2AB73]/15 text-[#737C4C]"
                  : "bg-[#403A35]/10 text-[#756E64]"
              }`}
            >
              {studentDrawingAllowed
                ? "✏ Students can draw"
                : "👀 Students view only"}
            </div>
          )}

          {saveState ===
            "saving" && (
            <span className="hidden text-[9px] font-black text-[#756E64] md:inline">
              Saving...
            </span>
          )}

          {saveState ===
            "saved" && (
            <span className="hidden text-[9px] font-black text-[#737C4C] md:inline">
              ✓ Saved
            </span>
          )}

        </div>

      </div>

      {/* =================================================
          SYNC
      ================================================= */}

      {syncing && (
        <div className="shrink-0 bg-[#A2AB73]/10 px-4 py-2 text-center text-xs font-bold text-[#737C4C]">
          Syncing the teacher&apos;s whiteboard...
        </div>
      )}

      {syncError && (
        <div className="shrink-0 bg-[#CC3A63]/10 px-4 py-2 text-center text-xs font-bold text-[#CC3A63]">
          {syncError}
        </div>
      )}

      {/* =================================================
          EXCALIDRAW
      ================================================= */}

      <div className="relative min-h-0 flex-1">

        {/*
         * View-only students keep the canvas itself, zoom controls and
         * panning, but the Excalidraw editing chrome is hidden.
         *
         * The selectors are scoped to this whiteboard instance only, so
         * the teacher and students with drawing access keep the full UI.
         */}
        {studentViewOnly && (
          <style>
            {`
              /*
               * Excalidraw has changed some toolbar class names across
               * releases, so we target both the older and newer names.
               * This CSS is only active for a Cohiva view-only student.
               */
              .cohiva-student-view-only .App-menu_top,
              .cohiva-student-view-only .App-toolbar,
              .cohiva-student-view-only .App-toolbar-container,
              .cohiva-student-view-only .App-toolbar-content,
              .cohiva-student-view-only .layer-ui__wrapper__top-left,
              .cohiva-student-view-only .layer-ui__wrapper__top-right,
              .cohiva-student-view-only .layer-ui__wrapper__top-right--compact,
              .cohiva-student-view-only .excalidraw-ui-top-right,
              .cohiva-student-view-only .main-menu-trigger,
              .cohiva-student-view-only .sidebar-trigger,
              .cohiva-student-view-only .mobile-misc-tools-container,
              .cohiva-student-view-only .tray-misc-tools-container,
              .cohiva-student-view-only .undo-redo-buttons,
              .cohiva-student-view-only .undo-button-container {
                display: none !important;
              }
            `}
          </style>
        )}

        <div
          className={`h-full w-full ${
            studentViewOnly
              ? "cohiva-student-view-only"
              : ""
          }`}
        >

        <Excalidraw
  excalidrawAPI={(api) => {
    /*
     * Only store the Excalidraw API here.
     *
     * Do NOT call setActiveTool() inside this
     * callback because Excalidraw may not have
     * completely mounted yet.
     */
    apiRef.current =
      api;
  }}
          onChange={
            handleChange
          }

          /*
           * Student is view-only unless
           * permission has explicitly
           * been verified as allowed.
         */
          viewModeEnabled={
            !canEdit
          }

          /*
           * Official Excalidraw UI suppression for view-only students.
           * Unlike CSS alone, zen mode is handled by Excalidraw itself,
           * so the drawing toolbar/menu/library controls do not render.
           * The CSS above remains as a fallback across package versions.
           */
          zenModeEnabled={
            studentViewOnly
          }

          initialData={{
            appState: {
              viewBackgroundColor:
                "#FFFFFF",

              currentItemStrokeColor:
                "#202020",

              currentItemOpacity:
                100,

              currentItemStrokeWidth:
                2,
            },
          }}

          UIOptions={{
            canvasActions: {
              clearCanvas:
                false,
            },
          }}
        />

        </div>

        {/* =================================================
            HARD STUDENT GATE

            This prevents pointer input
            while permission is unknown.

            It exists even though
            viewModeEnabled is already
            false/true accordingly.
        ================================================= */}

        {!isTeacher &&
          active &&
          !permissionReady && (
          <div className="absolute inset-0 z-[150] flex items-center justify-center bg-white/80 backdrop-blur-[1px]">

            <div className="rounded-[22px] border border-[#403A35]/10 bg-[#FFF7EB] px-6 py-5 text-center shadow-xl">

              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#A2AB73]/20 border-t-[#A2AB73]" />

              <p className="mt-3 font-black text-[#3D3732]">
                Checking whiteboard access
              </p>

              <p className="mt-1 text-xs text-[#756E64]">
                Applying the teacher&apos;s current permission...
              </p>

            </div>

          </div>
        )}

      </div>

    </div>
  );
};

export default WhiteboardCanvas;