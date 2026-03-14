import mongoose from "mongoose";
const dotenv = require("dotenv");
const result = dotenv.config();

const IP = process.env.IP_DB || "localhost";
const PORT = process.env.PORT_DB || 27017;
const DATABASE = process.env.DATABASE_NAME || "TEST_DB";
const AUTH_DATABASE = process.env.AUTH_DATABASE || process.env.DATABASE_NAME;
const USER = process.env.USER_DB || "";
const PASS = process.env.PASS_DB || "";
const REPLICA_SET = process.env.REPLICA_SET || "rs0";

const connectDatabase = async (success?: Function, failure?: Function) => {
    const DB_URL = `mongodb://${IP}:${PORT}`;

    const mongoSetup: mongoose.ConnectOptions = {
        dbName: DATABASE,
        replicaSet: REPLICA_SET,
        directConnection: true,
    };

    if (USER) {
        Object.assign(mongoSetup, {
            auth: {
                username: USER,
                password: PASS,
            },
            authSource: AUTH_DATABASE,
        });
    }

    try {
        console.log("Connecting to MongoDB:", DB_URL, mongoSetup);
        await mongoose.connect(DB_URL, mongoSetup);
        console.log("MongoDB connected:", new Date());
        success?.(mongoose);
    } catch (err) {
        console.error("MongoDB connection error:", err);
        failure?.();
    }

    mongoose.connection.on("error", (err) => {
        console.error("MongoDB runtime error:", err);
    });
};

export default connectDatabase;
