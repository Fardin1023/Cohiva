import type { ReactNode } from "react";

import Sidebar from "@/components/Sidebar";
import Navbar from "@/components/ui/Navbar";

const HomeLayout = ({ children }: { children: ReactNode }) => {
  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="flex">
        <Sidebar />

        <section className="min-h-screen min-w-0 flex-1 px-4 pb-6 pt-[108px] sm:px-6 sm:pt-[116px] md:px-8 lg:px-12 xl:px-14">
          <div className="w-full">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default HomeLayout;