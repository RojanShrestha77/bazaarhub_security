import request from "supertest";
import { createApp } from "../../src/app";
import { CategoryModel } from "../../src/models/category.model";
import { createUser, createListing } from "../helpers/fixtures";

const app = createApp();

describe("two-level categories + search expansion", () => {
  let seller, parent, childA, childB;

  beforeEach(async () => {
    seller = await createUser({ role: "seller", sellerTier: "trusted" });
    parent = await CategoryModel.create({ name: "Electronics", slug: "electronics", parentId: null });
    childA = await CategoryModel.create({ name: "Headphones", slug: "electronics-headphones", parentId: parent._id });
    childB = await CategoryModel.create({ name: "Cameras", slug: "electronics-cameras", parentId: parent._id });
  });

  it("exposes parentId so the client can build the tree", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    const p = res.body.find((c: any) => c.slug === "electronics");
    const c = res.body.find((c: any) => c.slug === "electronics-headphones");
    expect(p.parentId).toBeNull();
    expect(String(c.parentId)).toBe(String(parent._id));
  });

  it("searching by a PARENT category returns listings from all its subcategories", async () => {
    await createListing(seller, { category: childA._id, status: "active", title: "Sony Headphones" });
    await createListing(seller, { category: childB._id, status: "active", title: "Canon Camera" });

    const res = await request(app).get(`/api/listings/search?category=${parent.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
  });

  it("searching by a SUBcategory returns only that subcategory's listings", async () => {
    await createListing(seller, { category: childA._id, status: "active", title: "Sony Headphones" });
    await createListing(seller, { category: childB._id, status: "active", title: "Canon Camera" });

    const res = await request(app).get(`/api/listings/search?category=${childA.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.listings[0].title).toBe("Sony Headphones");
  });

  it("returns nothing for an unknown category (no injection, no leak)", async () => {
    const res = await request(app).get(`/api/listings/search?category=does-not-exist`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});
