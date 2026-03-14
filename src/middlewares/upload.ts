import multer from "multer";

function createUploadMiddleware(options: {
    maxSize: number;
    mimeTypes: RegExp;
}) {
    return multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: options.maxSize },
        fileFilter: (_req, file, cb) => {
            if (!options.mimeTypes.test(file.mimetype)) {
                return cb(new Error("Invalid file type"));
            }
            cb(null, true);
        },
    });
}

export const uploadImage = createUploadMiddleware({
    maxSize: 5 * 1024 * 1024, // 5MB
    mimeTypes: /^image\/(jpeg|png|webp|jpg)$/,
});
