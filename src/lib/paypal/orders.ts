import "server-only";
import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  type Order,
} from "@paypal/paypal-server-sdk";
import { paypalCredentials, appBaseUrl } from "./config";
import { PaypalApiError, PaypalNotConfiguredError } from "./rest";

let orders: OrdersController | null = null;

function ordersController(): OrdersController {
  if (orders) return orders;
  const creds = paypalCredentials();
  if (!creds) throw new PaypalNotConfiguredError();
  const client = new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: creds.clientId,
      oAuthClientSecret: creds.clientSecret,
    },
    timeout: 20_000,
    environment: process.env.PAYPAL_ENVIRONMENT === "PRODUCTION" ? Environment.Production : Environment.Sandbox,
    logging: { logLevel: LogLevel.Warn, logRequest: { logBody: false }, logResponse: { logHeaders: false } },
  });
  orders = new OrdersController(client);
  return orders;
}

function wrap(endpoint: string, err: unknown): never {
  if (err instanceof ApiError) throw new PaypalApiError(endpoint, err.statusCode, err.body?.toString() ?? "");
  throw err;
}

export type CreatedOrder = { id: string; approveUrl: string; status: string };

export async function createFundingOrder(input: {
  paymentId: string;
  stageId: string;
  amountUsd: string;
  description: string;
  brandName: string;
}): Promise<CreatedOrder> {
  try {
    const { result } = await ordersController().createOrder({
      paypalRequestId: `order-${input.paymentId}`,
      prefer: "return=representation",
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [
          {
            referenceId: input.stageId,
            customId: input.paymentId,
            invoiceId: `HB-${input.paymentId.slice(0, 18)}`,
            description: input.description.slice(0, 127),
            softDescriptor: "HOMEBOUND",
            amount: { currencyCode: "USD", value: input.amountUsd },
          },
        ],
        paymentSource: {
          paypal: {
            experienceContext: {
              brandName: input.brandName,
              shippingPreference: PaypalWalletContextShippingPreference.NoShipping,
              userAction: PaypalExperienceUserAction.PayNow,
              returnUrl: `${appBaseUrl()}/api/paypal/return?paymentId=${input.paymentId}`,
              cancelUrl: `${appBaseUrl()}/?cancelled=${input.paymentId}`,
            },
          },
        },
      },
    });
    const approveUrl = result.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
    if (!result.id || !approveUrl) throw new Error("PayPal order created without an approval link");
    return { id: result.id, approveUrl, status: result.status ?? "CREATED" };
  } catch (err) {
    wrap("orders.create", err);
  }
}

export async function captureOrder(orderId: string, paymentId: string): Promise<Order> {
  try {
    const { result } = await ordersController().captureOrder({
      id: orderId,
      paypalRequestId: `capture-${paymentId}`,
      prefer: "return=representation",
    });
    return result;
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 422 && String(err.body).includes("ORDER_ALREADY_CAPTURED")) {
      return getOrder(orderId);
    }
    wrap("orders.capture", err);
  }
}

export async function getOrder(orderId: string): Promise<Order> {
  try {
    const { result } = await ordersController().getOrder({ id: orderId });
    return result;
  } catch (err) {
    wrap("orders.get", err);
  }
}

export function captureFromOrder(order: Order): { captureId: string | null; status: string | null } {
  const capture = order.purchaseUnits?.[0]?.payments?.captures?.[0];
  return { captureId: capture?.id ?? null, status: capture?.status ?? null };
}
