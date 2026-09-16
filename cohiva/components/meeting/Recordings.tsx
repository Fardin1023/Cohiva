"use client";

const Recordings = () => {
  return (
    <section className="w-full pb-10">
      <div className="mb-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#B9687C]">Cohiva media</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#3D3732] sm:text-4xl">Recordings</h1>
        <p className="mt-3 max-w-xl text-[#756E64]">Hosted recording has been removed from Cohiva.</p>
      </div>
      <div className="rounded-[30px] border border-[#403A35]/10 bg-[#FFF7EB] p-10 text-center shadow-sm sm:p-14">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#B9687C]/15 text-4xl">⏺</div>
        <h2 className="mt-6 text-2xl font-black text-[#3D3732]">Self-hosted recording is the next media feature</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#756E64]">Your live meetings now run through Cohiva RTC and mediasoup. Recording will be implemented against that self-hosted media path.</p>
      </div>
    </section>
  );
};

export default Recordings;
