import express from "express";
import mongoose from "mongoose";
import { ElasticSearch } from "../../elasticsearch/elastic.client";
import { getCategoryAndDescendantIds } from "../utils/category-tree";

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
        const categoryIdValue = Array.isArray(categoryId)
            ? categoryId[0]
            : categoryId;

        if (
            categoryIdValue &&
            !mongoose.isValidObjectId(categoryIdValue.toString())
        ) {
            return res.status(400).json({ message: "Invalid category id" });
        }

        const categoryIds = categoryIdValue
            ? await getCategoryAndDescendantIds(categoryIdValue.toString())
            : undefined;

        const results = await ElasticSearch.searchProductsAdvanced({
            query: query?.toString(),
            brand: brand?.toString(),
            categoryIds,
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
