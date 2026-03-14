import { ElasticSearch } from "../../elastic.client";
import fs from "fs";
import path from "path";

export const productNameElasticsearch = "products";

const bodySchema = {
    settings: { number_of_shards: 1, number_of_replicas: 0 },
    mappings: {
        properties: {
            title: { type: "text", fields: { keyword: { type: "keyword" } } },
            brand: { type: "keyword" },
            description: { type: "text" },
            categoryId: { type: "keyword" },
            rating: { type: "integer" },
            isHide: { type: "integer" },
            specifications: {
                type: "nested",
                properties: {
                    key: { type: "keyword" },
                    value: { type: "text" },
                },
            },
            variants: {
                type: "nested",
                properties: {
                    version: { type: "keyword" },
                    colorName: { type: "keyword" },
                    price: { type: "integer" },
                    salePrice: { type: "integer" },
                    sku: { type: "keyword" },
                    _id: { type: "keyword" },
                },
            },
        },
    },
};

export const createIndexProduct = async () => {
    console.log("create index products");
    await ElasticSearch.createIndex(productNameElasticsearch, bodySchema);
};

export const insertData = async () => {
    const filePath = path.join(
        process.cwd(),
        "elasticsearch",
        "insert",
        "collection-product",
        "products.json"
    );

    const errorLogPath = path.join(
        process.cwd(),
        "elasticsearch",
        "insert",
        "collection-product",
        "insert-error.log"
    );

    try {
        const rawData = fs.readFileSync(filePath, "utf-8");
        const products = JSON.parse(rawData);

        console.log(`Found ${products.length} products in JSON file`);

        for (const product of products) {
            const { _id, ...esData } = product;
            esData.isHide = Number(esData.isHide) || 0;

            try {
                await ElasticSearch.insertDoc(
                    productNameElasticsearch,
                    _id.toString(),
                    esData
                );
                console.log(`Inserted product ${_id} into Elasticsearch`);
            } catch (err) {
                console.error(`Error inserting product ${_id}:`, err);

                fs.appendFileSync(errorLogPath, _id + "\n", "utf-8");
            }
        }

        console.log("Insert process finished!");
        console.log(`Check "${errorLogPath}" for failed inserts.`);
    } catch (err) {
        console.error("Error reading JSON file or inserting products:", err);
    }
};
