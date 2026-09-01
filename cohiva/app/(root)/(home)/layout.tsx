import type { ReactNode } from "react";

import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/ui/Navbar";

const HomeLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <section className="min-h-screen flex-1 px-5 pb-6 pt-[120px] sm:px-8 md:px-12 lg:px-14">
          <div className="w-full">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default HomeLayout;