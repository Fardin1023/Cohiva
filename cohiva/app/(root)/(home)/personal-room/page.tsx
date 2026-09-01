import { auth } from "@clerk/nextjs/server";

const PersonalRoom = async () => {
  await auth.protect();

  return (
    <div>
      {/* keep your existing page here */}
    </div>
  );
};

export default PersonalRoom;