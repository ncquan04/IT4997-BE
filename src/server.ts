import "dotenv/config";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import helmet from "helmet";
import { AddressInfo } from "net";
import AuthRouter from "./routes/auth.router";
import CategoryRouter from "./routes/category.router";
import ProductRouter from "./routes/product.router";
import connectDatabase from "./utils/connectDB";
import PaymentRouter from "./routes/payment.router";
import CartRouter from "./routes/cart.router";
import OrderRouter from "./routes/order.router";
import SearchProductRouter from "./routes/search.router";
import WishListRouter from "./routes/wishList.router";
import { ElasticSearch } from "../elasticsearch/elastic.client";
import { createSocketServer } from "./utils/socket.config";
import { registerSocketListeners } from "./socket/socket.bootstrap";
import UploadRouter from "./routes/upload.router";
import ReportRouter from "./routes/report.router";
import NotificationRouter from "./routes/notification.router";

const app = express();
const httpServer = createServer(app);
// register socket
const io = createSocketServer(httpServer);
registerSocketListeners(io);

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (
                origin.startsWith("http://localhost") ||
                origin.startsWith("http://127.0.0.1")
            ) {
                return callback(null, true);
            }
            return callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(cookieParser());
app.use(bodyParser.json({ limit: "500mb" }));
app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
        },
    })
);
app.set("trust proxy", true);

try {
    app.use("/api", AuthRouter);
    app.use("/api", CategoryRouter);
    app.use("/api", ProductRouter);
    app.use("/api", PaymentRouter);
    app.use("/api", CartRouter);
    app.use("/api", OrderRouter);
    app.use("/api", SearchProductRouter);
    app.use("/api", WishListRouter);
    app.use("/api", UploadRouter);
    app.use("/api", ReportRouter);
    app.use("/api", NotificationRouter);
    app.use("/api", async function (req, res) {
        res.status(200).json("hello");
    });
} catch (error: any) {
    console.log("error ", error);
}

const PORT = process.env.PORT || 4001;
const server = httpServer.listen(PORT as number, "0.0.0.0", function () {
    //start server
    const addressInfo: string | AddressInfo | null = server.address();
    const port =
        typeof addressInfo === "string"
            ? addressInfo
            : addressInfo
            ? addressInfo.port
            : "";
    console.log("Server listening on port " + port);
    connectDatabase();
    // connectRedis(() => {
    //     listOkay.push("redis");
    //     checkAllService(listOkay);
    // });
    ElasticSearch.connected();
});
