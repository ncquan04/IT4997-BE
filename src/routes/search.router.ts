import express from "express";
import { ElasticSearch } from "../../elasticsearch/elastic.client";

const SearchProductRouter = express.Router();

SearchProductRouter.get("/search/products", async (req, res) => {
    const {
        query,
        brand,
        categoryId,
        specKey,
        specValue,
        minPrice,
        maxPrice,
        page,
    } = req.query;

    try {
        const results = await ElasticSearch.searchProductsAdvanced({
            query: query?.toString(),
            brand: brand?.toString(),
            categoryId: categoryId?.toString(),
            specKey: specKey?.toString(),
            specValue: specValue?.toString(),
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
            page: page ? Number(page) : undefined,
        });

        res.json(results);
    } catch (err) {
        console.error("Search API error:", err);
        res.status(500).json("Search failed");
    }
});

export default SearchProductRouter;
