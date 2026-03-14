import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
        userId: { 
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        refreshToken: { 
            type: String, 
            required: true,
            unique: true
        },
        expireAt: { 
            type: Date, 
            required: true 
        },
    }, 
    { timestamps: true }   
);

sessionSchema.index({ expriseAt: 1 }, { expireAfterSeconds: 0 });


const SessionModel = mongoose.model("Session", sessionSchema);
export default SessionModel;
