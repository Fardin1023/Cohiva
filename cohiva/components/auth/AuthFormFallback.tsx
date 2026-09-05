const AuthFormFallback = () => {
  return (
    <div
      aria-hidden="true"
      className="space-y-4"
    >
      <div className="h-11 animate-pulse rounded-xl bg-[#F1E6D4] motion-reduce:animate-none" />
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#403A35]/10" />
        <div className="h-3 w-8 rounded bg-[#F1E6D4]" />
        <div className="h-px flex-1 bg-[#403A35]/10" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-[#F1E6D4]" />
        <div className="h-11 animate-pulse rounded-xl bg-white ring-1 ring-[#403A35]/10 motion-reduce:animate-none" />
      </div>
      <div className="h-11 animate-pulse rounded-xl bg-[#CC3A63]/20 motion-reduce:animate-none" />
    </div>
  );
};

export default AuthFormFallback;
