// upload/upload.image.ts
import { UploadApiResponse } from "cloudinary";
import CloudinaryProvider from "./cloudinary.provider";

export async function uploadImageBuffer(
    file: Express.Multer.File,
    userId: string,
    path = "default"
): Promise<UploadApiResponse> {
    const cloudinary = CloudinaryProvider.getClient();

    return new Promise((resolve, reject) => {
        cloudinary.uploader
            .upload_stream(
                {
                    folder: `images/${path}/${userId}`,
                    resource_type: "image",
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result as UploadApiResponse);
                }
            )
            .end(file.buffer);
    });
}
