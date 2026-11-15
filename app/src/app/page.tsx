import Image from "next/image";
import { Game } from "@/components/Game";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BASE_PATH } from "@/engine/loadAssets";

export default function Home() {
  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <h1>
            <Image src={`${BASE_PATH}/logo.png`} alt="Acheinator" width={864} height={207} priority className="h-9 w-auto sm:h-10" />
          </h1>
          <ThemeSwitch />
        </div>
      </header>
      <main className="flex-1 px-4 py-6 sm:py-10">
        <Game />
      </main>
    </>
  );
}
