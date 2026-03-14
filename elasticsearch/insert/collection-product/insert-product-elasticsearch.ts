import { createIndexProduct, insertData } from "./product-elasticsearch";

async function main() {
    await createIndexProduct();
    await insertData();
}
main().catch((e) => console.log(e));
