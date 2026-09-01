import { auth } from "@clerk/nextjs/server";

const Recordings = async () => {
  await auth.protect();

  return (
    <div>
      {/* keep your existing page here */}
    </div>
  );
};

export default Recordings;