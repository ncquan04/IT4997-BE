import Stripe from "stripe";
import { stripeBrandConfig, StripeBrandConfig } from "../utils/stripe.config";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "your_secret_key";
class StripeService {
    private stripe;

    constructor(
        private config: StripeBrandConfig,
        private secretKey: string
    ) {
        this.stripe = new Stripe(secretKey);
    }

    async createCheckoutSession(
        line_items: any,
        success_url: string,
        cancel_url: string,
        discounts?: Stripe.Checkout.SessionCreateParams.Discount[],
        metadata?: Record<string, string>
    ) {
        return this.stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: line_items,
            ...(discounts && discounts.length > 0 ? { discounts } : {}),
            ...(metadata ? { metadata } : {}),
            custom_text: {
                submit: {
                    message: `Thanh toán bởi ${this.config.title}`,
                },
            },
            success_url,
            cancel_url,
        });
    }

    constructWebhookEvent(
        rawBody: Buffer | string,
        signature: string,
        secret: string
    ): Stripe.Event {
        return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    }

    retrieveCheckoutSession(sessionId: string) {
        return this.stripe.checkout.sessions.retrieve(sessionId);
    }

    async createAmountOffCoupon(amountOff: number) {
        return this.stripe.coupons.create({
            amount_off: amountOff,
            currency: "vnd",
            duration: "once",
            name: "Giảm giá đơn hàng",
        });
    }
}

export const stripeService = new StripeService(
    stripeBrandConfig,
    STRIPE_SECRET_KEY
);
