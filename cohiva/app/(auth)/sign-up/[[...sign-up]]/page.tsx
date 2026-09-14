import CohivaSignUpForm from "@/components/auth/CohivaSignUpForm";

const SignUpPage = () => {
  return (
    <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-5 sm:mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#A2AB73] sm:text-sm">
          Create your account
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#3D3732] sm:mt-3 sm:text-3xl">
          Join Cohiva today
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Create your account and enter your Cohiva workspace securely.
        </p>
      </div>

      <CohivaSignUpForm />
    </div>
  );
};

export default SignUpPage;
