import { SignIn } from "@clerk/nextjs";
import { authAppearance } from "@/lib/clerkAppearance";

const SignInPage = () => {
  return (
    <div className="animate-in fade-in slide-in-from-right-5 duration-300">
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-[#A2AB73]">
          Welcome back
        </p>

        <h1 className="mt-3 text-3xl font-bold text-[#3D3732]">
          Sign in to Cohiva
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Continue to your meetings, recordings, and personal room with your
          account.
        </p>
      </div>

      <SignIn
        appearance={authAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />
    </div>
  );
};

export default SignInPage;