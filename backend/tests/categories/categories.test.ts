import request from "supertest";

import { createApp } from "../../src/app";
import { createCategory } from "../helpers/fixtures";

const app = createApp();

describe("categories — read-only, not user-creatable", () => {
  it("GET /api/categories is public and lists seeded categories", async () => {
    await createCategory({ name: "Electronics", slug: "electronics" });
    await createCategory({ name: "Books", slug: "books" });

    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.map((c) => c.slug).sort()).toEqual(["books", "electronics"]);
  });

  it("there is no POST/PATCH/DELETE route for categories", async () => {
    const postRes = await request(app).post("/api/categories").send({ name: "Hacked" });
    expect(postRes.status).toBe(404); // Express: no route registered at all
  });
});
