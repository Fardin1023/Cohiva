import { SignIn } from "@clerk/nextjs";
import { authAppearance } from "@/lib/clerkAppearance";
import AuthFormFallback from "@/components/auth/AuthFormFallback";

const SignInPage = () => {
  return (
    <div className="animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-5 sm:mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#A2AB73] sm:text-sm">
          Welcome back
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#3D3732] sm:mt-3 sm:text-3xl">
          Sign in to Cohiva
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Continue to your classrooms, recordings, and personal room.
        </p>
      </div>

      <SignIn
        appearance={authAppearance}
        fallback={<AuthFormFallback />}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
      />
    </div>
  );
};

export default SignInPage;
