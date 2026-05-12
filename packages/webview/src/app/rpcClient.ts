import type {
  BackendNotification,
  RpcRequest,
  RpcResponse
} from "./rpcContract.generated";

export interface VsCodeWebviewApi {
  postMessage(message: RpcRequest): void;
}

export interface RpcClient {
  post(request: RpcRequest): void;
}

export function createRpcClient(vscode: VsCodeWebviewApi): RpcClient {
  return {
    post(request) {
      vscode.postMessage(request);
    }
  };
}

export type { BackendNotification, RpcRequest, RpcResponse };
