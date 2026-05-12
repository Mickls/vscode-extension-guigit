import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createRpcClient, type VsCodeWebviewApi } from "./app/rpcClient";
import "./styles/globals.wind.css";

declare const acquireVsCodeApi: () => VsCodeWebviewApi;

createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App rpcClient={createRpcClient(acquireVsCodeApi())} />
  </StrictMode>
);
