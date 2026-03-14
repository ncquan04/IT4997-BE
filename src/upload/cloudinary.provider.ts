// upload/CloudinaryProvider.ts
import { v2 as cloudinary, ConfigOptions } from "cloudinary";

class CloudinaryProvider {
    private client;

    constructor() {
        const config: ConfigOptions = {
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
            api_key: process.env.CLOUDINARY_API_KEY!,
            api_secret: process.env.CLOUDINARY_API_SECRET!,
        };

        cloudinary.config(config);
        this.client = cloudinary;
    }

    getClient() {
        return this.client;
    }
}

export default new CloudinaryProvider();
