// Seeds 30 active listings under a single seller so the marketplace/homepage
// have real data to browse during dev/testing. Idempotent: reruns delete this
// seller's previously-seeded batch (marked via the "seeded" tag below) before
// re-inserting, so running it twice doesn't double up listings.
import "dotenv/config";
import mongoose from "mongoose";
import { ListingModel } from "../src/models/listing.model";
import { CategoryModel } from "../src/models/category.model";
import { UserModel } from "../src/models/user.model";
import { MONGODB_URI } from "../src/configs";

const SELLER_EMAIL = "srozan555@gmail.com";

// One product per distinct leaf category name — every name below is unique
// across the whole taxonomy (seedCategories.ts), so findOne({ name }) can't
// collide with e.g. "Clothing" or "Shoes", which repeat under multiple parents.
const PRODUCTS: { title: string; description: string; priceRupees: number; quantity: number; category: string }[] = [
  { title: "Samsung Galaxy A54 5G", description: "6.4\" Super AMOLED, 128GB storage, 5000mAh battery. Sealed box, 1-year warranty.", priceRupees: 42999, quantity: 8, category: "Smartphones" },
  { title: "iPad 9th Gen 64GB Wi-Fi", description: "10.2-inch Retina display, A13 Bionic chip. Comes with charging cable and box.", priceRupees: 38500, quantity: 5, category: "Tablets" },
  { title: "Amazfit GTS 4 Smartwatch", description: "AMOLED display, 8-day battery life, built-in GPS, 150+ sport modes.", priceRupees: 12999, quantity: 15, category: "Smartwatches & Wearables" },
  { title: "Anker 20000mAh Power Bank", description: "22.5W fast charging, dual USB-A + USB-C output, compact design.", priceRupees: 3499, quantity: 25, category: "Power Banks" },
  { title: "Canon EOS M50 Mirrorless Camera", description: "24.1MP APS-C sensor, 4K video, flip-out touchscreen. Includes 15-45mm kit lens.", priceRupees: 78000, quantity: 3, category: "Cameras & Photography" },
  { title: "Sony WH-1000XM4 Headphones", description: "Industry-leading noise cancellation, 30-hour battery, touch controls.", priceRupees: 28500, quantity: 10, category: "Headphones & Audio" },
  { title: "JBL Flip 6 Bluetooth Speaker", description: "Waterproof IP67, punchy bass, 12-hour playtime. Available in black.", priceRupees: 9999, quantity: 18, category: "Speakers" },
  { title: "Sony PlayStation 5 Slim", description: "1TB SSD, includes one DualSense controller. Local unit, all accessories included.", priceRupees: 89999, quantity: 4, category: "Gaming Consoles" },
  { title: "DJI Mini 3 Drone", description: "4K/30fps camera, 38-min flight time, under 249g — no registration needed in most regions.", priceRupees: 65000, quantity: 2, category: "Drones" },
  { title: "ASUS Vivobook 15 Laptop", description: "Intel i5 12th Gen, 16GB RAM, 512GB SSD, 15.6\" FHD display. Windows 11 pre-installed.", priceRupees: 82000, quantity: 6, category: "Laptops" },
  { title: "LG 27\" IPS Monitor", description: "27-inch Full HD IPS panel, 75Hz refresh rate, HDMI + VGA ports.", priceRupees: 17500, quantity: 9, category: "Monitors" },
  { title: "Logitech MK270 Wireless Combo", description: "Wireless keyboard and mouse combo, long battery life, plug-and-play USB receiver.", priceRupees: 2199, quantity: 30, category: "Keyboards & Mice" },
  { title: "Corsair Vengeance 16GB RAM Kit", description: "DDR4 3200MHz (2x8GB), low-profile heat spreader, compatible with most desktop boards.", priceRupees: 6800, quantity: 20, category: "PC Components" },
  { title: "Samsung 43\" Crystal 4K TV", description: "4K UHD, HDR, built-in Smart Hub with Netflix and YouTube apps.", priceRupees: 52000, quantity: 5, category: "Televisions" },
  { title: "Gree 1.5 Ton Inverter AC", description: "Energy-efficient inverter compressor, fast cooling, remote control included.", priceRupees: 68000, quantity: 4, category: "Air Conditioners & Fans" },
  { title: "Philips Air Fryer HD9200", description: "4.1L capacity, rapid air technology, dishwasher-safe basket.", priceRupees: 13500, quantity: 12, category: "Kitchen Appliances" },
  { title: "3-Seater Fabric Sofa", description: "Solid wood frame, high-density foam cushions, grey upholstery. Local delivery available.", priceRupees: 45000, quantity: 3, category: "Furniture" },
  { title: "Set of 3 Wall Art Canvas Prints", description: "Framed abstract canvas prints, ready to hang, 40x60cm each.", priceRupees: 2999, quantity: 14, category: "Home Decor" },
  { title: "LED Floor Lamp with Dimmer", description: "Modern tripod design, 3 brightness levels, energy-efficient LED bulb included.", priceRupees: 4200, quantity: 10, category: "Lighting" },
  { title: "Men's Leather Grooming Kit", description: "Beard trimmer, comb, scissors, and travel pouch. Great gift set.", priceRupees: 2499, quantity: 20, category: "Grooming" },
  { title: "Sterling Silver Pendant Necklace", description: "925 sterling silver, minimalist design, comes in a gift box.", priceRupees: 3299, quantity: 16, category: "Jewellery" },
  { title: "Korean Skincare Starter Set", description: "Cleanser, toner, and moisturizer bundle for combination skin.", priceRupees: 1899, quantity: 22, category: "Skincare" },
  { title: "Maybelline Fit Me Foundation", description: "Shade 220, matte finish, oil-control formula for all-day wear.", priceRupees: 950, quantity: 35, category: "Makeup" },
  { title: "Dior Sauvage EDT 100ml", description: "Original sealed bottle, long-lasting fresh spicy scent.", priceRupees: 8500, quantity: 8, category: "Fragrances" },
  { title: "Wooden Building Blocks Set", description: "100-piece educational wooden blocks, safe non-toxic paint, ages 3+.", priceRupees: 1599, quantity: 25, category: "Toys" },
  { title: "Adjustable Dumbbell Set 20kg", description: "Pair of adjustable dumbbells, rubber-coated plates, compact storage.", priceRupees: 7500, quantity: 9, category: "Exercise & Fitness" },
  { title: "Hybrid Road Bicycle 21-Speed", description: "Lightweight aluminum frame, Shimano gears, front suspension fork.", priceRupees: 32000, quantity: 4, category: "Cycling" },
  { title: "4-Person Camping Tent", description: "Waterproof, easy 10-minute setup, includes carry bag and stakes.", priceRupees: 6900, quantity: 11, category: "Camping & Hiking" },
  { title: "Car Dashboard Camera 1080p", description: "Full HD recording, night vision, loop recording, easy windshield mount.", priceRupees: 4500, quantity: 15, category: "Car Accessories" },
  { title: "Yamaha F310 Acoustic Guitar", description: "Full-size steel-string acoustic, spruce top, includes gig bag.", priceRupees: 18500, quantity: 6, category: "Musical Instruments" },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);

  const seller = await UserModel.findOne({ email: SELLER_EMAIL });
  if (!seller) {
    throw new Error(`No user found with email ${SELLER_EMAIL}`);
  }
  if (seller.role !== "seller") {
    throw new Error(`User ${SELLER_EMAIL} has role "${seller.role}", not "seller" — seed aborted`);
  }

  const categories = await CategoryModel.find({ name: { $in: PRODUCTS.map((p) => p.category) } });
  const categoryIdByName = new Map(categories.map((c) => [c.name, c._id]));

  const missing = PRODUCTS.map((p) => p.category).filter((name) => !categoryIdByName.has(name));
  if (missing.length > 0) {
    throw new Error(`Missing categories (run "npm run seed:categories" first): ${missing.join(", ")}`);
  }

  // Clear this seller's previously-seeded batch so reruns don't duplicate.
  const deleted = await ListingModel.deleteMany({ sellerId: seller._id, description: { $regex: /\[seeded\]$/ } });

  const docs = PRODUCTS.map((p) => ({
    sellerId: seller._id,
    title: p.title,
    description: `${p.description} [seeded]`,
    priceMinorUnits: Math.round(p.priceRupees * 100),
    category: categoryIdByName.get(p.category),
    status: "active" as const,
    quantity: p.quantity,
    images: [],
  }));

  const inserted = await ListingModel.insertMany(docs);

  console.log(`Removed ${deleted.deletedCount} previously-seeded listing(s) for ${SELLER_EMAIL}`);
  console.log(`Inserted ${inserted.length} active listings for ${SELLER_EMAIL}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
