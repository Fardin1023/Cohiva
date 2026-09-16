import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

const ForgotPasswordPage = () => {
  return (
    <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-5 sm:mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#A2AB73] sm:text-sm">
          Account recovery
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#3D3732] sm:mt-3 sm:text-3xl">
          Forgot your password?
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Enter the email used for your Cohiva account. Reset links expire after 30 minutes.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
};

export default ForgotPasswordPage;
