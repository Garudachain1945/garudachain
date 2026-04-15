import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{
          __html: `
            *, *::before, *::after { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              background-color: #0d0d1a;
              overflow: hidden;
            }
            #root {
              display: flex;
              width: 100%;
              height: 100vh;
              align-items: center;
              justify-content: center;
              background-color: #0d0d1a;
            }
            ::-webkit-scrollbar { display: none; }
            * { scrollbar-width: none; -ms-overflow-style: none; }
          `
        }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
