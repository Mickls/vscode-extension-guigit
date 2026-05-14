import type { RpcPayloadByType, RpcRequest, RpcRequestType, RpcResponse } from "./contract";
import { backendErrorResponse, unknownRequestResponse } from "./errors";
import type { Logger } from "../../logging/LoggerService";

type MaybePromise<T> = T | Promise<T>;

export type RpcHandler<TType extends RpcRequestType> = (
  request: Extract<RpcRequest, { type: TType }>
) => MaybePromise<RpcPayloadByType[TType]>;
export type RpcErrorMessageFormatter = (error: Error, request: RpcRequest) => string;

export type RpcHandlerMap = {
  [Type in RpcRequestType]?: RpcHandler<Type>;
};

export interface RpcRouter {
  dispatch(request: RpcRequest): Promise<RpcResponse>;
}

export function createRpcRouter(
  handlers: RpcHandlerMap,
  logger?: Pick<Logger, "debug" | "error">,
  formatErrorMessage?: RpcErrorMessageFormatter
): RpcRouter {
  return {
    async dispatch(request) {
      logger?.debug("rpc.request", {
        id: request.id,
        type: request.type
      });

      const handler = handlers[request.type] as
        | ((request: RpcRequest) => MaybePromise<RpcPayloadByType[typeof request.type]>)
        | undefined;

      if (!handler) {
        logger?.error("rpc.unknownRequest", {
          id: request.id,
          type: request.type
        });
        return unknownRequestResponse(request);
      }

      try {
        const response = {
          id: request.id,
          ok: true,
          type: request.type,
          payload: await handler(request)
        } as RpcResponse;

        logger?.debug("rpc.response", {
          id: request.id,
          type: request.type
        });

        return response;
      } catch (error) {
        logger?.error("rpc.error", {
          id: request.id,
          message: (error as Error).message,
          type: request.type
        });
        const backendError = error as Error;
        return backendErrorResponse(request, backendError, formatErrorMessage?.(backendError, request));
      }
    }
  };
}
