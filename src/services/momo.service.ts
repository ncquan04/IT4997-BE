import axios from "axios";
import crypto from "crypto";

interface CreatePaymentParams {
    amount: number;
    orderId: string;
    orderInfo: string;
    lang?: string;
}

interface MomoConfig {
    partnerCode: string;
    accessKey: string;
    secretKey: string;
    requestType: string;
    endpoint: string;
    redirectUrl: string; // dùng cho client redirect
    ipnUrl: string; // MoMo callback
}

class MomoService {
    private config: MomoConfig;

    constructor(config: MomoConfig) {
        this.config = config;
    }

    public setConfig(config: Partial<MomoConfig>) {
        this.config = { ...this.config, ...config };
    }

    // Signature cho REQUEST (create payment) — theo đúng thứ tự spec
    private generateRequestSignature(params: {
        accessKey: string;
        amount: string;
        extraData: string;
        ipnUrl: string;
        orderId: string;
        orderInfo: string;
        partnerCode: string;
        redirectUrl: string;
        requestId: string;
        requestType: string;
    }): string {
        const rawSignature =
            `accessKey=${params.accessKey}` +
            `&amount=${params.amount}` +
            `&extraData=${params.extraData}` +
            `&ipnUrl=${params.ipnUrl}` +
            `&orderId=${params.orderId}` +
            `&orderInfo=${params.orderInfo}` +
            `&partnerCode=${params.partnerCode}` +
            `&redirectUrl=${params.redirectUrl}` +
            `&requestId=${params.requestId}` +
            `&requestType=${params.requestType}`;

        return crypto
            .createHmac("sha256", this.config.secretKey)
            .update(rawSignature)
            .digest("hex");
    }

    public verifyMomoIPNSignature(params: Record<string, any>): boolean {
        const rawSignature =
            `accessKey=${params.accessKey}` +
            `&amount=${params.amount}` +
            `&extraData=${params.extraData}` +
            `&message=${params.message}` +
            `&orderId=${params.orderId}` +
            `&orderInfo=${params.orderInfo}` +
            `&orderType=${params.orderType}` +
            `&partnerCode=${params.partnerCode}` +
            `&payType=${params.payType}` +
            `&requestId=${params.requestId}` +
            `&responseTime=${params.responseTime}` +
            `&resultCode=${params.resultCode}` +
            `&transId=${params.transId}`;

        const signature = crypto
            .createHmac("sha256", this.config.secretKey)
            .update(rawSignature)
            .digest("hex");

        return signature === params.signature;
    }

    // Tạo payment
    public async createPayment({
        amount,
        orderId,
        orderInfo,
        lang = "vi",
    }: CreatePaymentParams) {
        const requestId = Date.now().toString();
        const extraData = ""; // nếu cần gửi thêm data thì encode JSON rồi truyền ở đây

        // CHÚ Ý: tên field phải khớp EXACT với thứ tự trong generateRequestSignature
        const paramsForSig = {
            accessKey: this.config.accessKey,
            amount: String(amount),
            extraData,
            ipnUrl: this.config.ipnUrl,
            orderId,
            orderInfo,
            partnerCode: this.config.partnerCode,
            redirectUrl: this.config.redirectUrl, // <--- KHÔNG ĐƯỢC GỌI returnUrl
            requestId,
            requestType: this.config.requestType,
        };

        const signature = this.generateRequestSignature(paramsForSig);

        // Body gửi lên MoMo theo API v2
        const body = {
            partnerCode: this.config.partnerCode,
            accessKey: this.config.accessKey,
            requestId,
            amount: String(amount),
            orderId,
            orderInfo,
            redirectUrl: this.config.redirectUrl,
            ipnUrl: this.config.ipnUrl,
            extraData,
            requestType: this.config.requestType,
            signature,
            lang,
        };

        try {
            const response = await axios.post(this.config.endpoint, body, {
                headers: { "Content-Type": "application/json" },
            });
            return response.data;
        } catch (error: any) {
            console.error(
                "MoMo payment error:",
                error.response?.data || error.message
            );
            throw error;
        }
    }
}
export const momoService = new MomoService({
    partnerCode: "MOMO",
    accessKey: "F8BBA842ECF85",
    secretKey: "K951B6PE1waDMi640xX08PD3vg6EkVlz",
    requestType: "captureWallet",
    endpoint: "https://test-payment.momo.vn/v2/gateway/api/create",
    redirectUrl: "http://localhost:4000",
    ipnUrl: "http://localhost:4000/api/payment/weeb-hook",
});
