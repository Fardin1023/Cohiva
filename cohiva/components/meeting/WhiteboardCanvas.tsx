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
  useCallStateHooks,
} from "@stream-io/video-react-sdk";

import type {
  CustomVideoEvent,
  StreamVideoEvent,
} from "@stream-io/video-react-sdk";

import {
  useUser,
} from "@clerk/nextjs";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "@excalidraw/excalidraw/index.css";

import {
  DEFAULT_COHIVA_PERMISSIONS,
  type CohivaPermissions,
} from "./MeetingPermissionsPanel";

/* =========================================================
   TYPES
========================================================= */

type WhiteboardCanvasProps = {
  callId: string;
};

type WhiteboardTool =
  | "pen"
  | "highlighter"
  | "eraser";

type IncomingBatch = {
  chunks:
    Array<
      string | undefined
    >;

  received:
    Set<number>;

  total: number;

  snapshot: boolean;
};

type SaveState =
  | "idle"
  | "saving"
  | "saved"
  | "error";

/* =========================================================
   CONFIG
========================================================= */

const WHITEBOARD_EVENT =
  "cohiva-whiteboard";

const MAX_CHUNK_BYTES =
  1600;

const LIVE_SYNC_INTERVAL_MS =
  180;

const SETTLE_SNAPSHOT_MS =
  650;

const RECOVERY_SNAPSHOT_MS =
  2500;

/*
 * Database autosave waits a little
 * longer than realtime sync.

 * We don't need to write to MongoDB
 * on every pen movement.
 */
const DATABASE_SAVE_DELAY_MS =
  1800;

/* =========================================================
   UTF-8 CHUNKING
========================================================= */

const splitIntoChunks = (
  value: string
) => {
  const encoder =
    new TextEncoder();

  const chunks:
    string[] =
    [];

  let currentChunk =
    "";

  let currentBytes =
    0;

  for (
    const character of value
  ) {
    const bytes =
      encoder.encode(
        character
      ).length;

    if (
      currentChunk &&
      currentBytes +
        bytes >
        MAX_CHUNK_BYTES
    ) {
      chunks.push(
        currentChunk
      );

      currentChunk =
        character;

      currentBytes =
        bytes;
    } else {
      currentChunk +=
        character;

      currentBytes +=
        bytes;
    }
  }

  if (currentChunk) {
    chunks.push(
      currentChunk
    );
  }

  return chunks;
};

/* =========================================================
   WHITEBOARD
========================================================= */

const WhiteboardCanvas = ({
  callId,
}: WhiteboardCanvasProps) => {
  const call =
    useCall();

  const {
    user,
  } =
    useUser();

  const currentUserId =
    user?.id;

  const {
    useCallCustomData,
  } =
    useCallStateHooks();

  const custom =
    useCallCustomData();

  /* =====================================================
     PERMISSIONS
  ===================================================== */

  const savedPermissions =
    custom?.cohiva_permissions as
      | Partial<CohivaPermissions>
      | undefined;

  const permissions:
    CohivaPermissions = {
    ...DEFAULT_COHIVA_PERMISSIONS,
    ...savedPermissions,
  };

  const isTeacher =
    Boolean(
      call?.isCreatedByMe
    );

  const allowStudents =
    permissions.studentWhiteboard;

  const canEdit =
    isTeacher ||
    allowStudents;

  /* =====================================================
     EXCALIDRAW
  ===================================================== */

  const apiRef =
    useRef<ExcalidrawImperativeAPI | null>(
      null
    );

  const [
    excalidrawReady,
    setExcalidrawReady,
  ] =
    useState(false);

  /* =====================================================
     REALTIME REFS
  ===================================================== */

  const applyingRemoteRef =
    useRef(false);

  const lastSentVersionsRef =
    useRef<
      Map<string, number>
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

  const liveSyncTimerRef =
    useRef<number | null>(
      null
    );

  const settleTimerRef =
    useRef<number | null>(
      null
    );

  const sendingRef =
    useRef(false);

  const sendAgainRef =
    useRef(false);

  const boardDirtyRef =
    useRef(false);

  const initialSyncCompleteRef =
    useRef(
      isTeacher
    );

  /* =====================================================
     PERSISTENCE REFS
  ===================================================== */

  const databaseSaveTimerRef =
    useRef<number | null>(
      null
    );

  const databaseSavingRef =
    useRef(false);

  const databaseSaveAgainRef =
    useRef(false);

  const persistedBoardLoadedRef =
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
    syncing,
    setSyncing,
  ] =
    useState(
      !isTeacher
    );

  const [
    syncError,
    setSyncError,
  ] =
    useState(false);

  const [
    exported,
    setExported,
  ] =
    useState(false);

  const [
    saveState,
    setSaveState,
  ] =
    useState<SaveState>(
      "idle"
    );

  /* =====================================================
     LOAD PERSISTED BOARD
  ===================================================== */

  const loadPersistedBoard =
    useCallback(
      async () => {
        const api =
          apiRef.current;

        if (!api) {
          return;
        }

        try {
          const response =
            await fetch(
              `/api/meetings/whiteboard-state?callId=${encodeURIComponent(
                callId
              )}`,
              {
                method:
                  "GET",

                cache:
                  "no-store",
              }
            );

          const data =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              data.error ||
                "Unable to load saved board."
            );
          }

          persistedBoardLoadedRef.current =
            true;

          if (
            !data.exists ||
            !Array.isArray(
              data.elements
            ) ||
            data.elements.length ===
              0
          ) {
            return;
          }

          const elements =
            data.elements as
              ExcalidrawElement[];

          applyingRemoteRef.current =
            true;

          api.updateScene({
            elements,
          });

          /*
           * Register persisted versions
           * so simply loading the board
           * doesn't resend every element
           * as a new edit.
           */
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

          window.requestAnimationFrame(
            () => {
              applyingRemoteRef.current =
                false;
            }
          );

          /*
           * Teacher now has the saved
           * authoritative board locally.
           */
          if (
            isTeacher
          ) {
            initialSyncCompleteRef.current =
              true;
          }
        } catch (
          error
        ) {
          console.error(
            "Cohiva saved board load error:",
            error
          );

          persistedBoardLoadedRef.current =
            true;
        }
      },
      [
        callId,
        isTeacher,
      ]
    );

  /* =====================================================
     LOAD WHEN EXCALIDRAW IS READY
  ===================================================== */

  useEffect(() => {
    if (
      !excalidrawReady ||
      persistedBoardLoadedRef.current
    ) {
      return;
    }

    void loadPersistedBoard();
  }, [
    excalidrawReady,
    loadPersistedBoard,
  ]);

  /* =====================================================
     SAVE TO DATABASE
  ===================================================== */

  const persistBoard =
    useCallback(
      async () => {
        /*
         * Teacher's browser is the
         * canonical persistent copy.
         */
        if (
          !isTeacher
        ) {
          return;
        }

        const api =
          apiRef.current;

        if (!api) {
          return;
        }

        if (
          databaseSavingRef.current
        ) {
          databaseSaveAgainRef.current =
            true;

          return;
        }

        databaseSavingRef.current =
          true;

        setSaveState(
          "saving"
        );

        try {
          const elements =
            api.getSceneElementsIncludingDeleted();

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

                    title:
                      "Cohiva Classroom Whiteboard",
                  }),
              }
            );

          const result =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              result.error ||
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
            2000
          );
        } catch (
          error
        ) {
          console.error(
            "Persistent whiteboard save error:",
            error
          );

          setSaveState(
            "error"
          );
        } finally {
          databaseSavingRef.current =
            false;

          if (
            databaseSaveAgainRef.current
          ) {
            databaseSaveAgainRef.current =
              false;

            window.setTimeout(
              () => {
                void persistBoard();
              },
              150
            );
          }
        }
      },
      [
        callId,
        isTeacher,
      ]
    );

  /* =====================================================
     SCHEDULE DATABASE SAVE
  ===================================================== */

  const scheduleDatabaseSave =
    useCallback(
      () => {
        if (
          !isTeacher
        ) {
          return;
        }

        if (
          databaseSaveTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            databaseSaveTimerRef.current
          );
        }

        databaseSaveTimerRef.current =
          window.setTimeout(
            () => {
              databaseSaveTimerRef.current =
                null;

              void persistBoard();
            },
            DATABASE_SAVE_DELAY_MS
          );
      },
      [
        isTeacher,
        persistBoard,
      ]
    );

  /* =====================================================
     SERVER REALTIME RELAY
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

        snapshot = false
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
              data,
              index
            ) => ({
              action:
                "elements",

              batchId,

              index,

              total:
                chunks.length,

              snapshot,

              data,
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
     SEND COMPLETE BOARD
  ===================================================== */

  const sendFullSnapshot =
    useCallback(
      async () => {
        const api =
          apiRef.current;

        if (!api) {
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

          boardDirtyRef.current =
            false;

          /*
           * Persist the cleared state.
           */
          scheduleDatabaseSave();

          return;
        }

        await sendElements(
          elements,
          true
        );

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

        boardDirtyRef.current =
          false;

        /*
         * Full snapshot is also
         * a good time to persist.
         */
        scheduleDatabaseSave();
      },
      [
        relayWhiteboardEvents,
        scheduleDatabaseSave,
        sendElements,
      ]
    );

  /* =====================================================
     APPLY REMOTE ELEMENTS
  ===================================================== */

  const applyRemoteElements =
    useCallback(
      (
        incoming:
          ExcalidrawElement[],

        snapshot:
          boolean
      ) => {
        const api =
          apiRef.current;

        if (!api) {
          return;
        }

        applyingRemoteRef.current =
          true;

        const current =
          api.getSceneElementsIncludingDeleted();

        const elementMap =
          new Map<
            string,
            ExcalidrawElement
          >();

        current.forEach(
          (
            element
          ) => {
            elementMap.set(
              element.id,
              element
            );
          }
        );

        incoming.forEach(
          (
            incomingElement
          ) => {
            const existing =
              elementMap.get(
                incomingElement.id
              );

            if (
              !existing ||
              incomingElement.version >=
                existing.version
            ) {
              elementMap.set(
                incomingElement.id,
                incomingElement
              );
            }

            const knownVersion =
              lastSentVersionsRef.current.get(
                incomingElement.id
              ) ??
              -1;

            if (
              incomingElement.version >
              knownVersion
            ) {
              lastSentVersionsRef.current.set(
                incomingElement.id,
                incomingElement.version
              );
            }
          }
        );

        api.updateScene({
          elements:
            Array.from(
              elementMap.values()
            ),
        });

        /*
         * Student edits were received.
         * Teacher's canonical copy now
         * needs persistence.
         */
        if (
          isTeacher
        ) {
          boardDirtyRef.current =
            true;

          scheduleDatabaseSave();
        }

        if (
          snapshot &&
          !isTeacher
        ) {
          initialSyncCompleteRef.current =
            true;

          setSyncing(
            false
          );

          setSyncError(
            false
          );
        }

        window.requestAnimationFrame(
          () => {
            applyingRemoteRef.current =
              false;
          }
        );
      },
      [
        isTeacher,
        scheduleDatabaseSave,
      ]
    );

  /* =====================================================
     RECEIVE REALTIME EVENTS
  ===================================================== */

  useEffect(() => {
    if (!call) {
      return;
    }

    const unsubscribe =
      call.on(
        "custom",
        (
          event:
            StreamVideoEvent
        ) => {
          const customEvent =
            event as
              CustomVideoEvent;

          const payload =
            customEvent.custom as
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

          if (
            currentUserId &&
            payload.senderId ===
              currentUserId
          ) {
            return;
          }

          const action =
            payload.action;

          /* =============================================
             SYNC REQUEST
          ============================================= */

          if (
            action ===
              "sync-request" &&
            isTeacher
          ) {
            void sendFullSnapshot()
              .catch(
                console.error
              );

            return;
          }

          /* =============================================
             EMPTY BOARD
          ============================================= */

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

            if (!api) {
              return;
            }

            applyingRemoteRef.current =
              true;

            api.resetScene();

            lastSentVersionsRef.current.clear();

            initialSyncCompleteRef.current =
              true;

            setSyncing(
              false
            );

            setSyncError(
              false
            );

            window.requestAnimationFrame(
              () => {
                applyingRemoteRef.current =
                  false;
              }
            );

            return;
          }

          /* =============================================
             CLEAR
          ============================================= */

          if (
            action ===
            "clear"
          ) {
            const api =
              apiRef.current;

            if (!api) {
              return;
            }

            applyingRemoteRef.current =
              true;

            api.resetScene();

            lastSentVersionsRef.current.clear();

            if (
              !isTeacher
            ) {
              initialSyncCompleteRef.current =
                true;

              setSyncing(
                false
              );

              setSyncError(
                false
              );
            }

            window.requestAnimationFrame(
              () => {
                applyingRemoteRef.current =
                  false;
              }
            );

            return;
          }

          /* =============================================
             ELEMENT CHUNK
          ============================================= */

          if (
            action !==
            "elements"
          ) {
            return;
          }

          const batchId =
            payload.batchId;

          const index =
            payload.index;

          const total =
            payload.total;

          const data =
            payload.data;

          const snapshot =
            payload.snapshot;

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

          if (
            total < 1 ||
            index < 0 ||
            index >= total
          ) {
            return;
          }

          let batch =
            incomingBatchesRef.current.get(
              batchId
            );

          if (!batch) {
            batch = {
              chunks:
                Array.from(
                  {
                    length:
                      total,
                  },

                  () =>
                    undefined
                ),

              received:
                new Set<number>(),

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
                const unfinished =
                  incomingBatchesRef.current.get(
                    batchId
                  );

                if (
                  !unfinished
                ) {
                  return;
                }

                incomingBatchesRef.current.delete(
                  batchId
                );

                if (
                  !isTeacher &&
                  unfinished.snapshot &&
                  !initialSyncCompleteRef.current
                ) {
                  void relayWhiteboardEvents([
                    {
                      action:
                        "sync-request",

                      requestId:
                        crypto.randomUUID(),
                    },
                  ]).catch(
                    console.error
                  );
                }
              },
              8000
            );
          }

          batch.chunks[
            index
          ] =
            data;

          batch.received.add(
            index
          );

          if (
            batch.received.size !==
            batch.total
          ) {
            return;
          }

          try {
            const serialized =
              batch.chunks
                .map(
                  (
                    chunk
                  ) =>
                    chunk ??
                    ""
                )
                .join(
                  ""
                );

            const elements =
              JSON.parse(
                serialized
              ) as
                ExcalidrawElement[];

            applyRemoteElements(
              elements,
              batch.snapshot
            );

            incomingBatchesRef.current.delete(
              batchId
            );
          } catch (
            error
          ) {
            console.error(
              "Cohiva whiteboard batch parse error:",
              error
            );

            incomingBatchesRef.current.delete(
              batchId
            );
          }
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    currentUserId,
    isTeacher,
    applyRemoteElements,
    relayWhiteboardEvents,
    sendFullSnapshot,
  ]);

  /* =====================================================
     STUDENT INITIAL LIVE SYNC
  ===================================================== */

  useEffect(() => {
    if (
      !call ||
      isTeacher
    ) {
      return;
    }

    initialSyncCompleteRef.current =
      false;

    setSyncing(
      true
    );

    setSyncError(
      false
    );

    let attempts =
      0;

    const requestBoard =
      async () => {
        if (
          initialSyncCompleteRef.current
        ) {
          return;
        }

        attempts +=
          1;

        try {
          await relayWhiteboardEvents([
            {
              action:
                "sync-request",

              requestId:
                crypto.randomUUID(),

              attempt:
                attempts,
            },
          ]);
        } catch (
          error
        ) {
          console.error(
            "Cohiva whiteboard sync request error:",
            error
          );
        }

        /*
         * The student may already have
         * loaded the persistent board.

         * If no live teacher responds,
         * don't leave "Syncing..." there
         * forever.
         */
        if (
          attempts >=
            5 &&
          !initialSyncCompleteRef.current
        ) {
          setSyncing(
            false
          );

          /*
           * Only show an error when there
           * wasn't even a saved board.
           */
          if (
            !persistedBoardLoadedRef.current
          ) {
            setSyncError(
              true
            );
          }
        }
      };

    const first =
      window.setTimeout(
        () => {
          void requestBoard();
        },
        400
      );

    const retry =
      window.setInterval(
        () => {
          if (
            initialSyncCompleteRef.current
          ) {
            window.clearInterval(
              retry
            );

            return;
          }

          void requestBoard();
        },
        1300
      );

    return () => {
      window.clearTimeout(
        first
      );

      window.clearInterval(
        retry
      );
    };
  }, [
    call,
    isTeacher,
    relayWhiteboardEvents,
  ]);

  /* =====================================================
     TEACHER PUSH ON PARTICIPANT JOIN
  ===================================================== */

  useEffect(() => {
    if (
      !call ||
      !isTeacher
    ) {
      return;
    }

    const unsubscribe =
      call.on(
        "call.session_participant_joined",
        () => {
          window.setTimeout(
            () => {
              void sendFullSnapshot()
                .catch(
                  console.error
                );
            },
            700
          );
        }
      );

    return () => {
      unsubscribe();
    };
  }, [
    call,
    isTeacher,
    sendFullSnapshot,
  ]);

  /* =====================================================
     LIVE LOCAL CHANGES
  ===================================================== */

  const sendLocalChanges =
    useCallback(
      async () => {
        if (
          !canEdit ||
          applyingRemoteRef.current
        ) {
          return;
        }

        if (
          sendingRef.current
        ) {
          sendAgainRef.current =
            true;

          return;
        }

        const api =
          apiRef.current;

        if (!api) {
          return;
        }

        const elements =
          api.getSceneElementsIncludingDeleted();

        const changed =
          elements.filter(
            (
              element
            ) => {
              const lastVersion =
                lastSentVersionsRef.current.get(
                  element.id
                ) ??
                -1;

              return (
                element.version >
                lastVersion
              );
            }
          );

        if (
          changed.length ===
          0
        ) {
          return;
        }

        sendingRef.current =
          true;

        try {
          await sendElements(
            changed,
            false
          );

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

          boardDirtyRef.current =
            true;
        } catch (
          error
        ) {
          console.error(
            "Cohiva live whiteboard relay error:",
            error
          );
        } finally {
          sendingRef.current =
            false;

          if (
            sendAgainRef.current
          ) {
            sendAgainRef.current =
              false;

            window.setTimeout(
              () => {
                void sendLocalChanges();
              },
              25
            );
          }
        }
      },
      [
        canEdit,
        sendElements,
      ]
    );

  /* =====================================================
     BOARD CHANGE
  ===================================================== */

  const handleChange =
    () => {
      if (
        !canEdit ||
        applyingRemoteRef.current
      ) {
        return;
      }

      boardDirtyRef.current =
        true;

      /* LIVE SYNC */

      if (
        liveSyncTimerRef.current ===
        null
      ) {
        liveSyncTimerRef.current =
          window.setTimeout(
            () => {
              liveSyncTimerRef.current =
                null;

              void sendLocalChanges();
            },
            LIVE_SYNC_INTERVAL_MS
          );
      }

      /* DATABASE AUTOSAVE */

      scheduleDatabaseSave();

      /* TEACHER FULL SNAPSHOT */

      if (
        isTeacher
      ) {
        if (
          settleTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            settleTimerRef.current
          );
        }

        settleTimerRef.current =
          window.setTimeout(
            () => {
              settleTimerRef.current =
                null;

              void sendFullSnapshot()
                .catch(
                  console.error
                );
            },
            SETTLE_SNAPSHOT_MS
          );
      }
    };

  /* =====================================================
     PERIODIC RECOVERY
  ===================================================== */

  useEffect(() => {
    if (
      !isTeacher
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          if (
            !boardDirtyRef.current
          ) {
            return;
          }

          void sendFullSnapshot()
            .catch(
              console.error
            );
        },
        RECOVERY_SNAPSHOT_MS
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    isTeacher,
    sendFullSnapshot,
  ]);

  /* =====================================================
     TIMER CLEANUP
  ===================================================== */

  useEffect(() => {
    return () => {
      if (
        liveSyncTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          liveSyncTimerRef.current
        );
      }

      if (
        settleTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          settleTimerRef.current
        );
      }

      if (
        databaseSaveTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          databaseSaveTimerRef.current
        );
      }
    };
  }, []);

  /* =====================================================
     PEN
  ===================================================== */

  const usePen =
    () => {
      if (!canEdit) {
        return;
      }

      const api =
        apiRef.current;

      if (!api) {
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
      if (!canEdit) {
        return;
      }

      const api =
        apiRef.current;

      if (!api) {
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
      if (!canEdit) {
        return;
      }

      const api =
        apiRef.current;

      if (!api) {
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
      if (!isTeacher) {
        return;
      }

      const api =
        apiRef.current;

      if (!api) {
        return;
      }

      const confirmed =
        window.confirm(
          "Clear the whiteboard for everyone?"
        );

      if (!confirmed) {
        return;
      }

      applyingRemoteRef.current =
        true;

      api.resetScene();

      lastSentVersionsRef.current.clear();

      boardDirtyRef.current =
        false;

      window.requestAnimationFrame(
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

        /*
         * Save the empty board
         * immediately.
         */
        await persistBoard();
      } catch (
        error
      ) {
        console.error(
          "Cohiva clear whiteboard error:",
          error
        );
      }
    };

  /* =====================================================
     MANUAL SYNC RETRY
  ===================================================== */

  const retrySync =
    async () => {
      if (
        isTeacher
      ) {
        return;
      }

      initialSyncCompleteRef.current =
        false;

      setSyncError(
        false
      );

      setSyncing(
        true
      );

      try {
        await relayWhiteboardEvents([
          {
            action:
              "sync-request",

            requestId:
              crypto.randomUUID(),
          },
        ]);
      } catch (
        error
      ) {
        console.error(
          "Cohiva manual whiteboard sync error:",
          error
        );

        setSyncing(
          false
        );

        setSyncError(
          true
        );
      }
    };

  /* =====================================================
     EXPORT PNG
  ===================================================== */

  const exportBoard =
    async () => {
      const api =
        apiRef.current;

      if (!api) {
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

        link.remove();

        URL.revokeObjectURL(
          url
        );

        setExported(
          true
        );

        window.setTimeout(
          () => {
            setExported(
              false
            );
          },
          1800
        );
      } catch (
        error
      ) {
        console.error(
          "Cohiva whiteboard export error:",
          error
        );
      }
    };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">

      {/* TOOLBAR */}

      <div className="flex min-h-[50px] shrink-0 flex-wrap items-center gap-2 border-b border-[#403A35]/10 bg-[#FFF7EB] px-3 py-2">

        <div
          className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] ${
            isTeacher
              ? "bg-[#CC3A63]/10 text-[#CC3A63]"
              : "bg-[#A2AB73]/15 text-[#737C4C]"
          }`}
        >
          {isTeacher
            ? "Teacher"
            : "Student"}
        </div>

        <button
          type="button"
          onClick={
            usePen
          }
          disabled={
            !canEdit
          }
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-35 ${
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
          disabled={
            !canEdit
          }
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-35 ${
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
          disabled={
            !canEdit
          }
          className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-35 ${
            activeTool ===
            "eraser"
              ? "bg-[#CC3A63] text-white"
              : "bg-white text-[#403A35]"
          }`}
        >
          ⌫ Eraser
        </button>

        {/* PNG EXPORT */}

        <button
          type="button"
          onClick={
            exportBoard
          }
          className="rounded-lg bg-[#A2AB73]/15 px-3 py-1.5 text-xs font-bold text-[#737C4C]"
        >
          {exported
            ? "✓ Downloaded"
            : "↓ PNG"}
        </button>

        {/* MANUAL DATABASE SAVE */}

        {isTeacher && (
          <button
            type="button"
            onClick={() =>
              void persistBoard()
            }
            disabled={
              saveState ===
              "saving"
            }
            className="rounded-lg bg-[#A2AB73] px-3 py-1.5 text-xs font-black text-white disabled:opacity-60"
          >
            {saveState ===
            "saving"
              ? "Saving..."
              : saveState ===
                  "saved"
                ? "✓ Saved"
                : saveState ===
                    "error"
                  ? "Save failed"
                  : "☁ Save"}
          </button>
        )}

        {isTeacher && (
          <button
            type="button"
            onClick={
              clearBoard
            }
            className="rounded-lg bg-[#CC3A63]/10 px-3 py-1.5 text-xs font-bold text-[#CC3A63]"
          >
            🧹 Clear
          </button>
        )}

        <div className="ml-auto hidden text-right sm:block">

          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-[#CC3A63]">
            Cohiva Classroom
          </p>

          <p className="text-[10px] font-bold text-[#756E64]">
            {isTeacher
              ? saveState ===
                  "saving"
                ? "Saving board..."
                : saveState ===
                    "saved"
                  ? "☁ Board saved"
                  : allowStudents
                    ? "Students can draw"
                    : "Students view only"
              : canEdit
                ? "✏ You can draw"
                : "👀 View only"}
          </p>

        </div>

      </div>

      {/* SYNC STATUS */}

      {syncing && (
        <div className="shrink-0 bg-[#A2AB73]/10 px-4 py-1.5 text-center text-[11px] font-bold text-[#737C4C]">
          Syncing teacher&apos;s whiteboard...
        </div>
      )}

      {syncError && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-[#CC3A63]/10 px-4 py-1.5">

          <span className="text-[11px] font-bold text-[#CC3A63]">
            Live whiteboard sync did not complete.
          </span>

          <button
            type="button"
            onClick={() =>
              void retrySync()
            }
            className="rounded-lg bg-[#CC3A63] px-3 py-1 text-[10px] font-black text-white"
          >
            Retry
          </button>

        </div>
      )}

      {/* BOARD */}

      <div className="relative min-h-0 flex-1 overflow-hidden">

        <Excalidraw
          excalidrawAPI={(
            api
          ) => {
            apiRef.current =
              api;

            setExcalidrawReady(
              true
            );
          }}
          onChange={
            handleChange
          }
          viewModeEnabled={
            !canEdit
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
              changeViewBackgroundColor:
                isTeacher,

              clearCanvas:
                false,

              export:
                false,

              loadScene:
                false,

              saveToActiveFile:
                false,

              toggleTheme:
                false,
            },
          }}
        />

      </div>

    </div>
  );
};

export default WhiteboardCanvas;