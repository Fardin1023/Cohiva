import { useEffect, useState } from "react";
import {
  Call,
  StreamCall,
  StreamVideo,
  StreamVideoClient,
  User,
} from "@stream-io/video-react-sdk";

const apiKey = process.env.NEXT_PUBLIC_STREAM_API_KEY;
const userId = "user-id";
const token = "authentication-token";
const user: User = { id: userId };

export const MyApp = () => {
  const [client, setClient] = useState<StreamVideoClient>();

  useEffect(() => {
    const myClient = new StreamVideoClient({ apiKey, user, token });
    setClient(myClient);

    return () => {
      myClient.disconnectUser().catch(console.error);
      setClient(undefined);
    };
  }, []);

  if (!client) return null;

  return (
    <StreamVideo client={client}>
      <MyCallUI client={client} />
    </StreamVideo>
  );
};

const MyCallUI = ({ client }: { client: StreamVideoClient }) => {
  const [call, setCall] = useState<Call>();

  useEffect(() => {
    const myCall = client.call("default", "my-first-call");
    myCall.join({ create: true }).catch(console.error);
    setCall(myCall);

    return () => {
      myCall.leave().catch(console.error);
      setCall(undefined);
    };
  }, [client]);

  if (!call) return null;

  return <StreamCall call={call}>{/* <MyVideoUI /> */}</StreamCall>;
};