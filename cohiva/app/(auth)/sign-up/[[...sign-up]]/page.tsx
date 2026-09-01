import { SignUp } from "@clerk/nextjs";
import { authAppearance } from "@/lib/clerkAppearance";

const SignUpPage = () => {
  return (
    <div className="animate-in fade-in slide-in-from-left-5 duration-300">
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-[#A2AB73]">
          Create your account
        </p>

        <h1 className="mt-3 text-3xl font-bold text-[#3D3732]">
          Join Cohiva today
        </h1>

        <p className="mt-2 text-sm leading-6 text-[#756E64]">
          Sign up to manage your calls, access your personal room, and stay
          connected beautifully.
        </p>
      </div>

      <SignUp
        appearance={authAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
      />
    </div>
  );
};

export default SignUpPage;