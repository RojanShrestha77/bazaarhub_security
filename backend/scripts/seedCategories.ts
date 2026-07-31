// Categories are seeded, not user-creatable — this is the only place Category
// documents are ever written. Two-level: each parent has subcategories.
// Idempotent: reruns upsert by slug. Child slugs are prefixed with the parent
// slug so they're globally unique (the unique index spans all categories).
import "dotenv/config";
import mongoose from "mongoose";
import { CategoryModel } from "../src/models/category.model";
import { MONGODB_URI } from "../src/configs";

interface ParentSeed {
  name: string;
  slug: string;
  subs: string[];
}

const TAXONOMY: ParentSeed[] = [
  { name: "Mobiles & Tablets", slug: "mobiles-tablets", subs: ["Smartphones", "Feature Phones", "Tablets", "Mobile Accessories", "Smartwatches & Wearables", "Power Banks"] },
  { name: "Electronics", slug: "electronics", subs: ["Cameras & Photography", "Headphones & Audio", "Speakers", "Gaming Consoles", "Drones", "Smart Home"] },
  { name: "Computers & Accessories", slug: "computers", subs: ["Laptops", "Desktops", "Monitors", "Storage & Drives", "Networking", "Keyboards & Mice", "PC Components"] },
  { name: "TV & Home Appliances", slug: "appliances", subs: ["Televisions", "Refrigerators", "Washing Machines", "Air Conditioners & Fans", "Kitchen Appliances", "Water Heaters"] },
  { name: "Home & Living", slug: "home-living", subs: ["Furniture", "Home Decor", "Kitchen & Dining", "Bedding & Bath", "Lighting", "Tools & Home Improvement", "Storage & Organization"] },
  { name: "Men's Fashion", slug: "mens-fashion", subs: ["Clothing", "Shoes", "Watches", "Bags & Wallets", "Accessories", "Grooming"] },
  { name: "Women's Fashion", slug: "womens-fashion", subs: ["Clothing", "Shoes", "Bags", "Jewellery", "Watches", "Accessories"] },
  { name: "Health & Beauty", slug: "health-beauty", subs: ["Skincare", "Makeup", "Hair Care", "Fragrances", "Personal Care", "Health & Wellness"] },
  { name: "Babies, Kids & Toys", slug: "babies-kids-toys", subs: ["Baby Gear", "Diapers & Feeding", "Kids' Clothing", "Toys", "Educational", "Games"] },
  { name: "Sports & Outdoors", slug: "sports-outdoors", subs: ["Exercise & Fitness", "Cycling", "Team Sports", "Camping & Hiking", "Sportswear", "Water Sports"] },
  { name: "Automotive & Motorbike", slug: "automotive", subs: ["Car Accessories", "Motorbike Accessories", "Oils & Fluids", "Parts & Tyres", "Tools & Equipment", "Car Care"] },
  { name: "Books, Media & Stationery", slug: "books-media", subs: ["Books", "Stationery & Office", "Art & Craft", "Musical Instruments", "Movies & Music"] },
  { name: "Groceries & Everyday", slug: "groceries", subs: ["Food & Beverages", "Household Supplies", "Cleaning", "Beverages", "Snacks"] },
  { name: "Pet Supplies", slug: "pet-supplies", subs: ["Dog", "Cat", "Fish & Aquatics", "Birds", "Pet Food", "Pet Accessories"] },
  { name: "Other", slug: "other", subs: [] },
];

const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function seed() {
  await mongoose.connect(MONGODB_URI);

  let parents = 0;
  let children = 0;
  for (const parent of TAXONOMY) {
    await CategoryModel.updateOne(
      { slug: parent.slug },
      { $set: { name: parent.name, slug: parent.slug, parentId: null } },
      { upsert: true },
    );
    const parentDoc = await CategoryModel.findOne({ slug: parent.slug });
    parents += 1;

    for (const subName of parent.subs) {
      const subSlug = `${parent.slug}-${kebab(subName)}`;
      await CategoryModel.updateOne(
        { slug: subSlug },
        { $set: { name: subName, slug: subSlug, parentId: parentDoc!._id } },
        { upsert: true },
      );
      children += 1;
    }
  }

  console.log(`Seeded ${parents} parent categories and ${children} subcategories`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
