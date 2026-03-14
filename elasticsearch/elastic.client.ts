import ES from "@elastic/elasticsearch";
import "dotenv/config";
import { Contacts } from "../src/shared/contacts";
const STATUS_HIDE = Contacts.Status.Evaluation;

const configObject = {
    ip: process.env.IP_ELASTIC || "localhost",
    port: process.env.HTTP_ELASTIC || 9200,
    user: process.env.USER_ELASTIC || "elastic",
    pass: process.env.PASS_ELASTIC || "changeme",
};

const { ip, port, user, pass } = configObject;
interface SearchParams {
    query?: string;
    brand?: string;
    categoryId?: string;
    specKey?: string;
    specValue?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: number;
    page?: number;
}
export class ElasticSearch {
    private static readonly esClient: ES.Client = new ES.Client({
        node: `https://${ip}:${port || 9200}`,
        auth: {
            username: user,
            password: pass,
        },
        tls: {
            rejectUnauthorized: false,
        },
        sniffOnStart: false,
        sniffInterval: false,
        sniffOnConnectionFault: false,
    });
    static async connected(successCallback?: Function) {
        try {
            await this.esClient.ping();
            console.log("elasticsearch connected");
            if (successCallback) {
                successCallback();
            }
        } catch (error) {
            console.log("connected error ", error);
        }
    }
    static async createIndex(indexName: string, body: any) {
        try {
            const exists = await this.esClient.indices.exists({
                index: indexName,
            });
            if (exists) {
                console.log(`Index "${indexName}" already exists.`);
                return;
            }

            await this.esClient.indices.create({
                index: indexName,
                body,
            });
            console.log(`Index "${indexName}" created successfully.`);
        } catch (err) {
            console.log("create index elasticsearch error: ", err);
        }
    }
    static async deleteIndex(indexName: string) {
        await this.esClient.indices.delete({ index: indexName });
        console.log("Index products removed");
    }
    static async insertDoc(indexName, _id, data) {
        return await this.esClient.index({
            index: indexName,
            id: _id,
            document: data,
        });
    }
    static async deleteDoc(indexName, _id) {
        try {
            await this.esClient.delete({
                index: indexName,
                id: _id,
            });
        } catch (err) {
            console.log("deleteDoc error ", err);
        }
    }
    static async updateDoc(indexName, _id, data) {
        await this.esClient.update({
            index: indexName,
            id: _id,
            body: {
                doc: data,
            },
            doc_as_upsert: true,
        });
    }
    static async searchAll() {
        const result = await this.esClient.search({
            index: "products",
            query: { match_all: {} }, // lấy tất cả document
        });
        return result;
    }
    static async getAllIndex() {
        const indices = await this.esClient.cat.indices({
            format: "json",
        });
        console.log("Numbers index:", indices.length);
        console.log(indices.map((i) => i.index));
    }
    static searchProductsAdvanced = async (params: SearchParams) => {
        const {
            query,
            brand,
            categoryId,
            specKey,
            specValue,
            minPrice,
            maxPrice,
            size = 20,
            page = 1,
        } = params;

        const must: any[] = [];
        const filter: any[] = [];

        // Full-text search
        if (query) {
            must.push({
                multi_match: {
                    query,
                    fields: ["title^3", "description", "specifications.value"],
                    fuzziness: "AUTO",
                },
            });
        }

        // Filters
        if (brand) filter.push({ term: { brand } });
        if (categoryId) filter.push({ term: { categoryId } });

        //Nest variants filter
        if (specKey || specValue) {
            const specMust: any[] = [];

            if (specKey) {
                specMust.push({ term: { "specifications.key": specKey } });
            }

            if (specValue) {
                specMust.push({
                    match: {
                        "specifications.value": {
                            query: specValue,
                            fuzziness: "AUTO",
                        },
                    },
                });
            }

            filter.push({
                nested: {
                    path: "specifications",
                    query: {
                        bool: { must: specMust },
                    },
                },
            });
        }

        // Nested variants filter
        if (minPrice || maxPrice) {
            const variantMust: any[] = [];

            if (minPrice || maxPrice) {
                const range: any = {};
                if (minPrice) range.gte = minPrice;
                if (maxPrice) range.lte = maxPrice;

                variantMust.push({ range: { "variants.price": range } });
            }

            filter.push({
                nested: {
                    path: "variants",
                    query: { bool: { must: variantMust } },
                },
            });
        }

        // filter products status public
        filter.push({
            term: {
                isHide: STATUS_HIDE.PUBLIC,
            },
        });
        const esQuery = {
            index: "products",
            from: (page - 1) * size,
            size,
            query: {
                bool: {
                    must,
                    filter,
                },
            },
        };

        const result = await this.esClient.search(esQuery);

        const hits = result.hits;
        const total = (hits.total as any)?.value || 0;
        const pageTotal = Math.ceil(total / size);

        return {
            page,
            size,
            total,
            pageTotal,
            data: hits.hits.map((hit: any) => ({
                _id: hit._id,
                ...hit._source,
                score: hit._score,
            })),
        };
    };
}
