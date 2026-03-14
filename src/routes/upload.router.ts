import express from "express";
import { uploadImage } from "../middlewares/upload";
import { uploadImageBuffer } from "../upload/upload.image";
import { auth } from "../middlewares/auth";

const UploadRouter = express.Router();

UploadRouter.post(
    "/upload/image",
    auth,
    uploadImage.single("file"),
    async (req, res) => {
        try {
            const result = await uploadImageBuffer(
                req.file!,
                (req as any).user.id,
                "test"
            );

            res.json({
                url: result.secure_url,
                publicId: result.public_id,
            });
        } catch (err) {
            console.log("upload image error: ", err);
            return res.status(500).json("Internal server error");
        }
    }
);
export default UploadRouter;
