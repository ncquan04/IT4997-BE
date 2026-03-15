import CategoryModel from "../models/category-model.mongo";

export const getCategoryAndDescendantIds = async (
    rootCategoryId: string
): Promise<string[]> => {
    const rootCategory = await CategoryModel.exists({ _id: rootCategoryId });
    if (!rootCategory) {
        return [];
    }

    const visited = new Set<string>([rootCategoryId]);
    let currentLevel: string[] = [rootCategoryId];

    while (currentLevel.length > 0) {
        const children = await CategoryModel.find(
            { parentCategoryId: { $in: currentLevel } },
            { _id: 1 }
        ).lean();

        const nextLevel: string[] = [];
        for (const child of children) {
            const childId = child._id.toString();
            if (!visited.has(childId)) {
                visited.add(childId);
                nextLevel.push(childId);
            }
        }

        currentLevel = nextLevel;
    }

    return Array.from(visited);
};
