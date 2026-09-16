import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string | string[];
  }>;
};

const ResetPasswordPage = async ({
  searchParams,
}: ResetPasswordPageProps) => {
  const params = await searchParams;
  const token =
    typeof params.token === "string"
      ? params.token
      : "";

  return (
    <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-5 sm:mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#A2AB73] sm:text-sm">
          Secure recovery
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#3D3732] sm:mt-3 sm:text-3xl">
          Set a new password
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Choose a new password for your Cohiva account.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  );
};

export default ResetPasswordPage;
