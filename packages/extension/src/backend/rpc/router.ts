import type { RpcPayloadByType, RpcRequest, RpcRequestType, RpcResponse } from "./contract";
import { backendErrorResponse, unknownRequestResponse } from "./errors";

type MaybePromise<T> = T | Promise<T>;

export type RpcHandler<TType extends RpcRequestType> = (
  request: Extract<RpcRequest, { type: TType }>
) => MaybePromise<RpcPayloadByType[TType]>;

export type RpcHandlerMap = {
  [Type in RpcRequestType]?: RpcHandler<Type>;
};

export interface RpcRouter {
  dispatch(request: RpcRequest): Promise<RpcResponse>;
}

export function createRpcRouter(handlers: RpcHandlerMap): RpcRouter {
  return {
    async dispatch(request) {
      const handler = handlers[request.type] as
        | ((request: RpcRequest) => MaybePromise<RpcPayloadByType[typeof request.type]>)
        | undefined;

      if (!handler) {
        return unknownRequestResponse(request);
      }

      try {
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: await handler(request)
        } as RpcResponse;
      } catch (error) {
        return backendErrorResponse(request, error as Error);
      }
    }
  };
}
