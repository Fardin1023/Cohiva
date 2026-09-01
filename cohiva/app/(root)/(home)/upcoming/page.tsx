import { auth } from "@clerk/nextjs/server";

const Upcoming = async () => {
  await auth.protect();

  return (
    <div>
      {/* keep your existing page here */}
    </div>
  );
};

export default Upcoming;