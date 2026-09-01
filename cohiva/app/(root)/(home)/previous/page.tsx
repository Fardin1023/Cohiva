import { auth } from "@clerk/nextjs/server";

const Previous = async () => {
  await auth.protect();

  return (
    <div>
      {/* keep your existing page here */}
    </div>
  );
};

export default Previous;