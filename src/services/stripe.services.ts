import Stripe from "stripe";
import { stripeBrandConfig, StripeBrandConfig } from "../utils/stripe.config";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "your_secret_key";
class StripeService {
    private stripe;

    constructor(private config: StripeBrandConfig, private secretKey: string) {
        this.stripe = new Stripe(secretKey);
    }

    async createCheckoutSession(
        line_items: any,
        success_url: string,
        cancel_url: string
    ) {
        return this.stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: line_items,
            custom_text: {
                submit: {
                    message: `Thanh toán bởi ${this.config.title}`,
                },
            },
            success_url,
            cancel_url,
        });
    }
}

export const stripeService = new StripeService(
    stripeBrandConfig,
    STRIPE_SECRET_KEY
);
