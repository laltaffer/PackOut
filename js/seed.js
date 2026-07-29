// Seed food library. Sources, in order of authority:
//   1. Lawrence's V2P sheet (reference/v2p-nutrition-sheet-export.md) — verbatim
//      values, blanks stay null (never invented).
//   2. Published Peak Refuel nutrition facts (reference/alaska-food-order.md) for
//      ordered meals the sheet doesn't cover.
// v2 (2026-07-19, dogfood feedback): every food carries its brand name; generic
// commodity items removed. weightOz is packed ounces where known, else null.

// favorite: true marks the meals from Lawrence's Guidefitter order
// (reference/alaska-food-order.md) — his core meals, pre-starred so a fresh
// state drafts from them with zero setup.
export const SEED = {
  version: 13,
  foods: [
    // Electrolytes / fluids
    { id: 'liquid-iv-white-peach', name: 'Liquid IV White Peach', kcal: 15, carbsG: 5, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    { id: 'liquid-iv-energy', name: 'Liquid IV Energy', kcal: 45, carbsG: 10, fatG: 0, proteinG: 0, weightOz: null, slotHint: 'electrolytes' },
    // Skratch Labs label (SVG panel, 2026-07-20): 1 scoop = 22g serving
    { id: 'skratch-hydration-mix', name: 'Skratch Labs Sport Hydration Mix (scoop)', kcal: 80, carbsG: 19, fatG: 0, proteinG: 0, weightOz: 0.78, slotHint: 'electrolytes' },

    // Breakfast
    { id: 'peak-strawberry-granola', name: 'Peak Refuel Strawberry Granola', kcal: 530, carbsG: 87, fatG: 9, proteinG: 23, weightOz: null, slotHint: 'breakfast', favorite: true },
    { id: 'justins-honey-pb', name: "Justin's Honey Peanut Butter", kcal: 210, carbsG: 6, fatG: 17, proteinG: 7, weightOz: null, slotHint: 'breakfast' },

    // Mains (lunch/dinner)
    { id: 'peak-homestyle-chicken-rice', name: 'Peak Refuel Homestyle Chicken & Rice', kcal: 740, carbsG: 61, fatG: null, proteinG: 40, weightOz: null, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-beef-stroganoff', name: 'Peak Refuel Beef Stroganoff', kcal: 810, carbsG: 50, fatG: null, proteinG: 41, weightOz: null, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-chicken-coconut-curry', name: 'Peak Refuel Chicken Coconut Curry', kcal: 850, carbsG: 66, fatG: 44, proteinG: 44, weightOz: 5.36, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-beef-pasta-marinara', name: 'Peak Refuel Beef Pasta Marinara', kcal: 1040, carbsG: 56, fatG: 55, proteinG: 49, weightOz: 6.35, slotHint: 'dinner', prep: 'cook', favorite: true },
    { id: 'peak-chicken-pesto-pasta', name: 'Peak Refuel Chicken Pesto Pasta', kcal: 920, carbsG: 42, fatG: 64, proteinG: 43, weightOz: 5.71, slotHint: 'dinner', prep: 'cook', favorite: true },

    // Peak Refuel meals catalog (reference/peak-refuel-catalog.md, label values)
    { id: 'peak-chicken-alfredo', name: 'Peak Refuel Chicken Alfredo', kcal: 830, carbsG: 46, fatG: 46, proteinG: 48, weightOz: 4.93, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-breakfast-skillet', name: 'Peak Refuel Breakfast Skillet', kcal: 540, carbsG: 36, fatG: 31, proteinG: 31, weightOz: 3.88, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-chicken-teriyaki-rice', name: 'Peak Refuel Chicken Teriyaki Rice', kcal: 580, carbsG: 78, fatG: 8, proteinG: 40, weightOz: 4.66, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-sweet-pork-rice', name: 'Peak Refuel Sweet Pork & Rice', kcal: 800, carbsG: 125, fatG: 17, proteinG: 40, weightOz: 6.07, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-white-chicken-chili', name: 'Peak Refuel White Chicken Chili', kcal: 760, carbsG: 53, fatG: 44, proteinG: 41, weightOz: 4.94, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-venison-casserole', name: 'Peak Refuel Venison Country Casserole', kcal: 920, carbsG: 69, fatG: 57, proteinG: 40, weightOz: 6.20, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-bison-bowl', name: 'Peak Refuel Backcountry Bison Bowl', kcal: 930, carbsG: 106, fatG: 40, proteinG: 42, weightOz: 7.05, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-buffalo-goulash', name: 'Peak Refuel MeatEater Buffalo Goulash', kcal: 890, carbsG: 79, fatG: 40, proteinG: 55, weightOz: 4.94, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-three-bean-chili-mac', name: 'Peak Refuel Three Bean Chili Mac', kcal: 610, carbsG: 119, fatG: 3.5, proteinG: 30, weightOz: 4.79, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-mountain-berry-granola', name: 'Peak Refuel Mountain Berry Granola', kcal: 570, carbsG: 108, fatG: 1.5, proteinG: 13, weightOz: 5.07, slotHint: 'breakfast' },
    { id: 'peak-butternut-dal-bhat', name: 'Peak Refuel Butternut Dal Bhat', kcal: 870, carbsG: 105, fatG: 43, proteinG: 23, weightOz: 5.85, slotHint: 'dinner', prep: 'cook' },
    { id: 'peak-biscuits-gravy', name: 'Peak Refuel Biscuits & Sausage Gravy', kcal: 1100, carbsG: 51, fatG: 85, proteinG: 34, weightOz: 6.77, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-peaches-oats', name: 'Peak Refuel Creamy Peaches and Oats', kcal: 1010, carbsG: 128, fatG: 42, proteinG: 30, weightOz: 7.05, slotHint: 'breakfast', prep: 'cook' },
    { id: 'peak-bison-ranch-mashers', name: 'Peak Refuel Bison Ranch Mashers', kcal: 1120, carbsG: 94, fatG: 66, proteinG: 40, weightOz: 7.40, slotHint: 'dinner', prep: 'cook' },

    // Stowaway Gourmet single meals (reference/stowaway-gourmet-catalog.md).
    // Per-pouch totals from each label; weightOz = Shopify shipping weight.
    { id: 'stowaway-comrade-doeganoff', name: 'Stowaway Gourmet Comrade Doeganoff', kcal: 514, carbsG: 48, fatG: 14, proteinG: 42, weightOz: 4.59, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-wild-boar-bacon-bean-stew', name: 'Stowaway Gourmet Wild Boar Bacon Bean Stew', kcal: 544, carbsG: 68, fatG: 14, proteinG: 42, weightOz: 5.19, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-bison-beer-black-bean-chili', name: 'Stowaway Gourmet Bison Beer Black Bean Chili', kcal: 706, carbsG: 70, fatG: 30, proteinG: 42, weightOz: 5.71, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-las-pollos-hermanas', name: 'Stowaway Gourmet Las Pollos Hermanas', kcal: 458, carbsG: 32, fatG: 20, proteinG: 38, weightOz: 5.19, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-lamb-bourguignon', name: 'Stowaway Gourmet Lamb Bourguignon', kcal: 564, carbsG: 40, fatG: 22, proteinG: 36, weightOz: 5.04, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-chana-masala', name: 'Stowaway Gourmet Chana Masala', kcal: 508, carbsG: 70, fatG: 20, proteinG: 18, weightOz: 4.59, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-spiced-creamy-oatmeal-pear', name: 'Stowaway Gourmet Spiced Creamy Oatmeal with Pear', kcal: 588, carbsG: 86, fatG: 22, proteinG: 12, weightOz: 4.30, slotHint: 'breakfast', prep: 'cook' },
    { id: 'stowaway-miso-salmon-okayu', name: 'Stowaway Gourmet Miso Salmon Okayu', kcal: 436, carbsG: 54, fatG: 12, proteinG: 24, weightOz: 4.23, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-lone-star-chili', name: 'Stowaway Gourmet Lone Star Chili', kcal: 685, carbsG: 12, fatG: 45, proteinG: 62, weightOz: 5.01, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-kimchi-jjigae', name: 'Stowaway Gourmet Kimchi Jjigae', kcal: 749, carbsG: 17, fatG: 69, proteinG: 23, weightOz: 4.66, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-sausage-and-eggs', name: 'Stowaway Gourmet Sausage and Eggs', kcal: 581, carbsG: 2, fatG: 49, proteinG: 33, weightOz: 3.88, slotHint: 'breakfast', prep: 'cook' },
    { id: 'stowaway-tiramisu-bites', name: 'Stowaway Gourmet Tiramisu Bites', kcal: 642, carbsG: 42, fatG: 51, proteinG: 9, weightOz: 4.37, slotHint: 'snack' },
    { id: 'stowaway-drunken-noodles', name: 'Stowaway Gourmet Drunken Noodles', kcal: 661, carbsG: 77, fatG: 25, proteinG: 35, weightOz: 6.14, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-butter-chicken', name: 'Stowaway Gourmet Butter Chicken', kcal: 674, carbsG: 68, fatG: 30, proteinG: 36, weightOz: 5.64, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-irish-pub-stew', name: 'Stowaway Gourmet Irish Pub Stew', kcal: 521, carbsG: 38, fatG: 28, proteinG: 34, weightOz: 4.41, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-curry-rice', name: 'Stowaway Gourmet Curry Rice', kcal: 635, carbsG: 88, fatG: 19, proteinG: 33, weightOz: 5.64, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-penne-alla-vodka', name: 'Stowaway Gourmet Penne Alla Vodka', kcal: 707, carbsG: 53, fatG: 47, proteinG: 25, weightOz: 5.29, slotHint: 'dinner', prep: 'cook' },
    // Jambalaya has no published Nutrition Facts panel; kcal/protein are the
    // front-of-pouch printed values, carbs/fat stay null (never invented).
    { id: 'stowaway-andouille-shrimp-jambalaya', name: 'Stowaway Gourmet Andouille and Shrimp Jambalaya', kcal: 633, carbsG: null, fatG: null, proteinG: 30, weightOz: 4.51, slotHint: 'dinner', prep: 'cook' },
    { id: 'stowaway-cereal-killer', name: 'Stowaway Gourmet Cereal Killer', kcal: 571, carbsG: 81, fatG: 20, proteinG: 25, weightOz: 6.60, slotHint: 'breakfast' },

    // Packit Gourmet single meals (reference/packit-gourmet-catalog.md).
    // Per-pouch totals from each label; weightOz = product-page meal net weight.
    { id: 'packit-austintacious-tortilla-soup', name: 'Packit Gourmet Austintacious Tortilla Soup', kcal: 600, carbsG: 72, fatG: 14, proteinG: 51, weightOz: 5.4, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-berry-berry-smoothie', name: 'Packit Gourmet Berry Berry Jump Start Smoothie', kcal: 400, carbsG: 51, fatG: 7, proteinG: 34, weightOz: 3.5, slotHint: 'breakfast' },
    { id: 'packit-bigun-burrito-bowl', name: "Packit Gourmet Big'un Burrito Bowl with Fajita Chicken", kcal: 530, carbsG: 69, fatG: 16, proteinG: 34, weightOz: 4.8, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-cajun-ranch-chicken-salad', name: 'Packit Gourmet Cajun Ranch Chicken Salad', kcal: 400, carbsG: 18, fatG: 17, proteinG: 47, weightOz: 3.2, slotHint: 'lunch' },
    { id: 'packit-curry-mango-chicken-salad', name: 'Packit Gourmet Curry Mango Chicken Salad', kcal: 410, carbsG: 20, fatG: 17, proteinG: 46, weightOz: 3.2, slotHint: 'lunch' },
    { id: 'packit-dabs-smash-burger', name: "Packit Gourmet Dab's Smash Burger with Secret Sauce", kcal: 560, carbsG: 22, fatG: 38, proteinG: 37, weightOz: 3.7, slotHint: 'lunch' },
    { id: 'packit-diner-deluxe-eggs', name: 'Packit Gourmet Diner Deluxe Eggs with Sausage', kcal: 460, carbsG: 3, fatG: 38, proteinG: 24, weightOz: 2.9, slotHint: 'breakfast', prep: 'cook' },
    { id: 'packit-dotties-chicken-dumplings', name: "Packit Gourmet Dottie's Chicken and Dumplings", kcal: 500, carbsG: 47, fatG: 10, proteinG: 56, weightOz: 4.8, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-good-day-sunshine-bowl', name: 'Packit Gourmet Good Day Sunshine Bowl', kcal: 530, carbsG: 74, fatG: 23, proteinG: 12, weightOz: 4.4, slotHint: 'breakfast', prep: 'cook' },
    { id: 'packit-black-bean-dip', name: 'Packit Gourmet Happy Hour Black Bean Dip', kcal: 320, carbsG: 40, fatG: 10, proteinG: 20, weightOz: 2.8, slotHint: 'snack', prep: 'cook' },
    { id: 'packit-pico-de-gallo', name: 'Packit Gourmet Happy Hour Pico de Gallo', kcal: 70, carbsG: 14, fatG: 0, proteinG: 2, weightOz: 0.7, slotHint: 'snack' },
    { id: 'packit-queso-rico-dip', name: 'Packit Gourmet Happy Hour Queso Rico Dip', kcal: 440, carbsG: 24, fatG: 26, proteinG: 28, weightOz: 3.5, slotHint: 'snack', prep: 'cook' },
    { id: 'packit-kickin-chicken-wrap', name: "Packit Gourmet Kickin' Chicken Hot Wings Wrap", kcal: 330, carbsG: 13, fatG: 4.5, proteinG: 59, weightOz: 3.0, slotHint: 'lunch' },
    { id: 'packit-many-beans-salad', name: 'Packit Gourmet Many Beans Salad', kcal: 670, carbsG: 111, fatG: 15, proteinG: 31, weightOz: 5.9, slotHint: 'lunch' },
    { id: 'packit-meyer-lemon-cheesecake', name: 'Packit Gourmet Meyer Lemon Cheesecake', kcal: 650, carbsG: 98, fatG: 21, proteinG: 14, weightOz: 5.2, slotHint: 'snack' },
    { id: 'packit-banana-puddin', name: "Packit Gourmet Mom's Banana Puddin'", kcal: 470, carbsG: 73, fatG: 17, proteinG: 8, weightOz: 3.8, slotHint: 'snack' },
    { id: 'packit-moonshine-margarita', name: 'Packit Gourmet Moonshine Margarita (4 svg pouch)', kcal: 400, carbsG: 156, fatG: 0, proteinG: 0, weightOz: 4.2, slotHint: 'snack' },
    { id: 'packit-peach-passion-smoothie', name: 'Packit Gourmet Peach Passion Jump Start Smoothie', kcal: 400, carbsG: 51, fatG: 6, proteinG: 34, weightOz: 3.5, slotHint: 'breakfast' },
    { id: 'packit-pizza-margherita', name: 'Packit Gourmet Pizza Margherita', kcal: 500, carbsG: 18, fatG: 31, proteinG: 38, weightOz: 3.6, slotHint: 'lunch' },
    { id: 'packit-polenta-pork-sausage', name: 'Packit Gourmet Polenta with Pork Sausage', kcal: 450, carbsG: 53, fatG: 19, proteinG: 17, weightOz: 3.5, slotHint: 'breakfast', prep: 'cook' },
    { id: 'packit-ramen-rescue-chicken', name: 'Packit Gourmet Ramen Rescue with Chicken (BYO noodles)', kcal: 60, carbsG: 11, fatG: 0.5, proteinG: 6, weightOz: null, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-santa-fe-corn-pudding', name: 'Packit Gourmet Santa Fe Corn Pudding', kcal: 480, carbsG: 65, fatG: 17, proteinG: 19, weightOz: 4.0, slotHint: 'breakfast', prep: 'cook' },
    { id: 'packit-southwest-corn-bean-salad', name: 'Packit Gourmet Southwest Corn & Black Bean Salad', kcal: 580, carbsG: 83, fatG: 20, proteinG: 28, weightOz: 5.0, slotHint: 'lunch' },
    { id: 'packit-strawberry-cheesecake', name: 'Packit Gourmet Strawberry Cheesecake', kcal: 620, carbsG: 93, fatG: 20, proteinG: 14, weightOz: 5.0, slotHint: 'snack' },
    { id: 'packit-tex-mex-breakfast-tacos', name: 'Packit Gourmet Tex-Mex Breakfast Tacos', kcal: 380, carbsG: 10, fatG: 30, proteinG: 18, weightOz: null, slotHint: 'breakfast', prep: 'cook' },
    { id: 'packit-texas-mesquite-chicken-salad', name: 'Packit Gourmet Texas Mesquite Chicken Salad', kcal: 410, carbsG: 17, fatG: 21, proteinG: 40, weightOz: 2.9, slotHint: 'lunch' },
    { id: 'packit-texas-state-fair-chili', name: 'Packit Gourmet Texas State Fair Chili', kcal: 650, carbsG: 68, fatG: 25, proteinG: 41, weightOz: 5.5, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-big-easy-cajun-gumbo', name: "Packit Gourmet The 'Big Easy' Cajun Gumbo", kcal: 510, carbsG: 61, fatG: 13, proteinG: 40, weightOz: 4.4, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-trailside-bean-cheese-burrito', name: 'Packit Gourmet Trailside Bean & Cheese Burrito', kcal: 410, carbsG: 42, fatG: 19, proteinG: 23, weightOz: 3.5, slotHint: 'lunch', prep: 'cook' },
    { id: 'packit-trailside-beef-bean-burrito', name: 'Packit Gourmet Trailside Beef & Bean Burrito', kcal: 580, carbsG: 49, fatG: 28, proteinG: 36, weightOz: 4.4, slotHint: 'lunch', prep: 'cook' },
    { id: 'packit-vegetable-ramen-rescue', name: 'Packit Gourmet Vegetable Ramen Rescue (BYO noodles)', kcal: 60, carbsG: 14, fatG: 0.5, proteinG: 2, weightOz: null, slotHint: 'dinner', prep: 'cook' },
    { id: 'packit-west-memphis-grits-souffle', name: 'Packit Gourmet West Memphis Grits Soufflé', kcal: 440, carbsG: 56, fatG: 18, proteinG: 16, weightOz: 3.5, slotHint: 'breakfast', prep: 'cook' },

    // Snacks
    { id: 'pro-bolt-chews', name: 'ProBar Bolt Chews', kcal: 90, carbsG: 23, fatG: null, proteinG: null, weightOz: null, slotHint: 'snack' },
    { id: 'probar-peanut-butter', name: 'ProBar Peanut Butter', kcal: 390, carbsG: 43, fatG: 8, proteinG: 12, weightOz: null, slotHint: 'snack' },
    { id: 'probar-blueberry-muffin', name: 'ProBar Blueberry Muffin', kcal: 400, carbsG: 44, fatG: null, proteinG: 10, weightOz: null, slotHint: 'snack' },
    { id: 'gu-energy-gel', name: 'GU Energy Gel', kcal: 100, carbsG: 22, fatG: null, proteinG: 0, weightOz: null, slotHint: 'snack' },
    { id: 'honey-stinger-waffle', name: 'Honey Stinger Waffle', kcal: 150, carbsG: 19, fatG: null, proteinG: 1, weightOz: null, slotHint: 'snack' },
    { id: 'packaroon', name: 'Packaroon', kcal: 160, carbsG: 12, fatG: 12, proteinG: 2, weightOz: null, slotHint: 'snack' },
    // Skratch Labs (label image, 2026-07-20): 80 kcal/25g serving, 2 servings/packet
    { id: 'skratch-energy-chews', name: 'Skratch Labs Energy Chews (packet)', kcal: 160, carbsG: 38, fatG: 0, proteinG: 0, weightOz: 1.76, slotHint: 'snack' },
    // haribo.com table: 100 kcal / 23g C / 2g P per 30g serving, normalized to
    // a 1 oz unit (Lawrence: track gummies by weight, not pieces) — qty = oz
    { id: 'haribo-goldbears-oz', name: 'Haribo Goldbears (per oz)', kcal: 95, carbsG: 22, fatG: 0, proteinG: 2, weightOz: 1, slotHint: 'snack' },
    // USDA FDC branded label (fdcId 2510113, Sweetwood Cattle Company; the
    // older Sweetwood Smokehouse listing 1785273 agrees): 200 kcal / 2g C /
    // 15g F / 13g P per 56g (2 oz) stick — qty = sticks. The protein-dense
    // snack that closes residual floor gaps (Lawrence's brand, 2026-07-21).
    { id: 'fatty-original-2oz', name: 'FATTY Original Smoked Meat Stick (2 oz)', kcal: 200, carbsG: 2, fatG: 15, proteinG: 13, weightOz: 2, slotHint: 'snack' },
    // Chomps Smoky BBQ Beef (seed v13, 2026-07-27, Lawrence's ask). Label read
    // off chomps.com/products/bbq-beef-jerky-stick: serving size is 1 stick
    // (33 g), so the panel's numbers ARE the whole item as packed — 100 kcal,
    // 0 g carb, 7 g fat, 10 g protein. Package weight 1.15 oz.
    { id: 'chomps-bbq-beef-stick', name: 'Chomps Smoky BBQ Beef Stick (1.15 oz)', kcal: 100, carbsG: 0, fatG: 7, proteinG: 10, weightOz: 1.15, slotHint: 'snack', url: 'https://chomps.com/products/bbq-beef-jerky-stick' },
  ],
}

export const TRIP_TYPES = ['backpacking', 'rifle', 'bow', 'fishing']

// The gear filing cabinet. The gear screen groups by this list in this order,
// so a category outside it is an item nobody can see — which is why the
// import gate refuses one (engine.js pins its own copy against this).
export const GEAR_CATEGORIES = [
  'Backpack', 'Shelter/Sleeping', 'Water', 'Cooking', 'Weapon', 'Optics/Bino Pouch',
  'Kill kit', 'Fishing', 'First aid & Safety', 'Clothing worn', 'Clothing packed', 'Luxuries',
]

// Categories that no longer exist but still arrive in old backups, and what
// they became. migrateGear renames them on every load, so the import gate has
// to let them through the door first.
export const RETIRED_GEAR_CATEGORIES = { 'Pack': 'Backpack', 'Food kit': 'Cooking' }

// Who makes the food, kept as an explicit table rather than read off id
// prefixes: 'pro-bolt-chews' and 'probar-peanut-butter' are the same company,
// and snack brands never prefixed cleanly at all. Starring a brand stars every
// food it makes, so drafting reaches for it first.
export const BRANDS = [
  { id: 'peak', label: 'Peak Refuel', kind: 'meal', ids: ['peak-'] },
  { id: 'stowaway', label: 'Stowaway Gourmet', kind: 'meal', ids: ['stowaway-'] },
  { id: 'packit', label: 'Packit Gourmet', kind: 'meal', ids: ['packit-'] },
  { id: 'fatty', label: 'FATTY', kind: 'snack', ids: ['fatty-'] },
  { id: 'chomps', label: 'Chomps', kind: 'snack', ids: ['chomps-'] },
  { id: 'probar', label: 'ProBar', kind: 'snack', ids: ['probar-', 'pro-bolt'] },
  { id: 'honey-stinger', label: 'Honey Stinger', kind: 'snack', ids: ['honey-stinger-'] },
  { id: 'gu', label: 'GU Energy', kind: 'snack', ids: ['gu-'] },
  { id: 'packaroon', label: 'Packaroon', kind: 'snack', ids: ['packaroon'] },
  { id: 'haribo', label: 'Haribo', kind: 'snack', ids: ['haribo-'] },
  { id: 'justins', label: "Justin's", kind: 'snack', ids: ['justins-'] },
  { id: 'skratch', label: 'Skratch Labs', kind: 'snack', ids: ['skratch-'] },
  { id: 'liquid-iv', label: 'Liquid IV', kind: 'snack', ids: ['liquid-iv-'] },
]

// A food belongs to the brand whose id patterns it starts with, or to none.
export function brandOf(foodId) {
  return BRANDS.find(b => b.ids.some(p => foodId.startsWith(p)))?.id ?? null
}

// Onboarding (spec #24, reworked 2026-07-27): the gear step asks how someone
// actually camps and builds the slots their answers imply — no pre-checked
// list of everything. Each option owns the rows it creates, so overlaps
// resolve by construction: a filter bottle is ONE slot, not a filter plus a
// container. Rows are blank slots (generic name, real category, no weight);
// the user names the specific item and weighs it later.
//
// Every question takes multiple answers. Onboarding maps a gear closet, not a
// trip: people own a tent AND a tarp, a day pack AND a hauler, and cook hot on
// some trips and cold on others. Options that genuinely name the same object
// share a row id (stakes, optics, kill kit, utensil), so answering twice never
// duplicates a slot.
const KILL_KIT = [
  { id: 'ob-knife', name: 'Knife', category: 'Kill kit' },
  { id: 'ob-game-bags', name: 'Game bags', category: 'Kill kit' },
]

export const GEAR_QUESTIONS = [
  {
    id: 'pack',
    categories: ['Backpack'],
    // A pack is one object with one brand and one weight (Lawrence
    // 2026-07-27). Frame-and-bag systems exist, but almost nobody mixes them
    // across trips, and splitting the row made the user do the arithmetic.
    prompt: 'Which pack are you taking?',
    options: [
      { value: 'daypack', label: 'Day pack', rows: [{ id: 'ob-daypack', name: 'Day pack', category: 'Backpack' }] },
      { value: 'multiday', label: 'Multi-day pack', rows: [{ id: 'ob-multiday-pack', name: 'Multi-day pack', category: 'Backpack' }] },
      { value: 'hauler', label: 'Meat hauler', note: 'frame pack, one item',
        rows: [{ id: 'ob-hauler', name: 'Meat hauler', category: 'Backpack' }] },
    ],
  },
  {
    id: 'sleep',
    categories: ['Shelter/Sleeping'],
    prompt: 'How are you sleeping?',
    hint: 'Any answer also adds a sleeping bag and a pad.',
    rows: [
      { id: 'ob-sleeping-bag', name: 'Sleeping bag or quilt', category: 'Shelter/Sleeping' },
      { id: 'ob-sleeping-pad', name: 'Sleeping pad', category: 'Shelter/Sleeping' },
    ],
    options: [
      { value: 'tent', label: 'Tent', rows: [{ id: 'ob-tent', name: 'Tent', category: 'Shelter/Sleeping' }, { id: 'ob-stakes', name: 'Stakes', category: 'Shelter/Sleeping' }] },
      { value: 'tarp', label: 'Tarp or floorless shelter', rows: [{ id: 'ob-tarp', name: 'Tarp', category: 'Shelter/Sleeping' }, { id: 'ob-stakes', name: 'Stakes', category: 'Shelter/Sleeping' }, { id: 'ob-ground-cloth', name: 'Ground cloth', category: 'Shelter/Sleeping' }] },
      { value: 'bivy', label: 'Bivy', rows: [{ id: 'ob-bivy', name: 'Bivy', category: 'Shelter/Sleeping' }] },
      { value: 'hammock', label: 'Hammock', rows: [{ id: 'ob-hammock', name: 'Hammock', category: 'Shelter/Sleeping' }, { id: 'ob-suspension', name: 'Suspension straps', category: 'Shelter/Sleeping' }] },
    ],
  },
  {
    id: 'water',
    categories: ['Water'],
    prompt: 'How are you handling water?',
    hint: 'A filter bottle is one item, not two.',
    options: [
      { value: 'filter', label: 'Filter', rows: [{ id: 'ob-water-filter', name: 'Water filter', category: 'Water' }] },
      { value: 'chem', label: 'Chemical or UV', rows: [{ id: 'ob-water-treatment', name: 'Chemical / UV treatment', category: 'Water' }] },
      { value: 'bladder', label: 'Bladder', rows: [{ id: 'ob-bladder', name: 'Hydration bladder', category: 'Water' }] },
      { value: 'bottles', label: 'Bottles', rows: [{ id: 'ob-bottles', name: 'Water bottles', category: 'Water' }] },
      { value: 'filter-bottle', label: 'Filter bottle', note: 'treats and carries',
        rows: [{ id: 'ob-filter-bottle', name: 'Filter bottle', category: 'Water' }] },
    ],
  },
  {
    id: 'cook',
    categories: ['Cooking'],
    prompt: 'Are you cooking on this trip?',
    options: [
      { value: 'hot', label: 'Hot meals', note: 'stove, fuel, pot, utensil',
        rows: [
          { id: 'ob-stove', name: 'Stove', category: 'Cooking' },
          { id: 'ob-fuel', name: 'Stove fuel', category: 'Cooking' },
          { id: 'ob-cook-pot', name: 'Cook pot', category: 'Cooking' },
          { id: 'ob-utensil', name: 'Utensil', category: 'Cooking' },
        ] },
      { value: 'cold', label: 'Cold food only', note: 'no stove to carry',
        rows: [{ id: 'ob-utensil', name: 'Utensil', category: 'Cooking' }] },
    ],
  },
  {
    id: 'rifle',
    when: ['rifle'],
    categories: ['Weapon', 'Kill kit'],
    prompt: 'Rifle hunt — what is going with you?',
    options: [
      { value: 'rifle', label: 'Rifle and ammunition',
        rows: [{ id: 'ob-rifle', name: 'Rifle', category: 'Weapon' }, { id: 'ob-ammo', name: 'Ammunition', category: 'Weapon' }] },
      { value: 'rest', label: 'Shooting rest', rows: [{ id: 'ob-shooting-rest', name: 'Shooting rest', category: 'Weapon' }] },
      { value: 'kill-kit', label: 'Kill kit', note: 'knife, game bags', rows: KILL_KIT },
    ],
  },
  {
    id: 'bow',
    when: ['bow'],
    categories: ['Weapon', 'Kill kit'],
    prompt: 'Bow hunt — what is going with you?',
    options: [
      { value: 'bow', label: 'Bow and release',
        rows: [{ id: 'ob-bow', name: 'Bow', category: 'Weapon' }, { id: 'ob-release', name: 'Release', category: 'Weapon' }] },
      { value: 'arrows', label: 'Arrows and broadheads',
        rows: [{ id: 'ob-arrows', name: 'Arrows', category: 'Weapon' }, { id: 'ob-broadheads', name: 'Broadheads', category: 'Weapon' }] },
      { value: 'kill-kit', label: 'Kill kit', note: 'knife, game bags', rows: KILL_KIT },
    ],
  },
  {
    // Optics are their own question (Lawrence 2026-07-27) — a spotting scope
    // and the tripod under it are decisions in their own right, not a
    // footnote on "what weapon". Shared by both hunt types, one row set.
    id: 'optics',
    when: ['rifle', 'bow'],
    categories: ['Optics/Bino Pouch'],
    prompt: 'What optics are you glassing with?',
    options: [
      { value: 'binos', label: 'Binoculars', rows: [{ id: 'ob-binoculars', name: 'Binoculars', category: 'Optics/Bino Pouch', carry: 'harness' }] },
      { value: 'spotter', label: 'Spotting scope', rows: [{ id: 'ob-spotting-scope', name: 'Spotting scope', category: 'Optics/Bino Pouch' }] },
      { value: 'tripod', label: 'Tripod', rows: [{ id: 'ob-tripod', name: 'Tripod', category: 'Optics/Bino Pouch' }] },
      { value: 'range-finder', label: 'Range finder', rows: [{ id: 'ob-range-finder', name: 'Range finder', category: 'Optics/Bino Pouch', carry: 'harness' }] },
      { value: 'harness', label: 'Bino harness', rows: [{ id: 'ob-bino-harness', name: 'Bino harness', category: 'Optics/Bino Pouch', carry: 'harness' }] },
    ],
  },
  {
    id: 'fishing',
    when: ['fishing'],
    categories: ['Fishing'],
    prompt: 'Fishing — what is going with you?',
    options: [
      { value: 'rod', label: 'Rod and reel',
        rows: [{ id: 'ob-rod', name: 'Rod', category: 'Fishing' }, { id: 'ob-reel', name: 'Reel', category: 'Fishing' }] },
      { value: 'tackle', label: 'Tackle', rows: [{ id: 'ob-tackle', name: 'Tackle', category: 'Fishing' }] },
      { value: 'waders', label: 'Waders', rows: [{ id: 'ob-waders', name: 'Waders', category: 'Fishing' }] },
      { value: 'net', label: 'Net', rows: [{ id: 'ob-net', name: 'Net', category: 'Fishing' }] },
    ],
  },
  {
    id: 'worn',
    categories: ['Clothing worn'],
    prompt: 'What are you wearing out?',
    hint: 'Worn weight is on your body, not in your pack — PackOut counts it separately.',
    options: [
      { value: 'boots', label: 'Boots', rows: [{ id: 'ob-boots', name: 'Boots', category: 'Clothing worn' }] },
      { value: 'socks', label: 'Socks', rows: [{ id: 'ob-socks-worn', name: 'Socks', category: 'Clothing worn' }] },
      { value: 'base', label: 'Base layer', rows: [{ id: 'ob-base-layer', name: 'Base layer', category: 'Clothing worn' }] },
      { value: 'pants', label: 'Pants', rows: [{ id: 'ob-pants', name: 'Pants', category: 'Clothing worn' }] },
      { value: 'hoody', label: 'Sun hoody or shirt', rows: [{ id: 'ob-hoody', name: 'Sun hoody', category: 'Clothing worn' }] },
      { value: 'cap', label: 'Cap or brimmed hat', rows: [{ id: 'ob-cap', name: 'Cap', category: 'Clothing worn' }] },
      // Alaska rains the whole week: the shell is worn, not packed (Lawrence
      // 2026-07-27). Worn rain gear is its own row — the same jacket in the
      // pack and on your back are different numbers in the weight rollup.
      { value: 'rain-worn', label: 'Rain shell', wet: true,
        rows: [{ id: 'ob-rain-shell-worn', name: 'Rain shell (worn)', category: 'Clothing worn' }] },
      { value: 'rain-pants-worn', label: 'Rain pants', wet: true,
        rows: [{ id: 'ob-rain-pants-worn', name: 'Rain pants (worn)', category: 'Clothing worn' }] },
    ],
  },
  {
    id: 'packed',
    categories: ['Clothing packed'],
    prompt: 'What clothing is going in the pack?',
    options: [
      { value: 'rain', label: 'Rain shell', wet: true, rows: [{ id: 'ob-rain-shell', name: 'Rain shell', category: 'Clothing packed' }] },
      { value: 'rain-pants', label: 'Rain pants', wet: true, rows: [{ id: 'ob-rain-pants', name: 'Rain pants', category: 'Clothing packed' }] },
      { value: 'puffy', label: 'Puffy or insulation', cold: true, rows: [{ id: 'ob-puffy', name: 'Puffy', category: 'Clothing packed' }] },
      { value: 'spare-socks', label: 'Spare socks', rows: [{ id: 'ob-spare-socks', name: 'Spare socks', category: 'Clothing packed' }] },
      { value: 'gloves', label: 'Gloves', cold: true, rows: [{ id: 'ob-gloves', name: 'Gloves', category: 'Clothing packed' }] },
      { value: 'beanie', label: 'Beanie', cold: true, rows: [{ id: 'ob-beanie', name: 'Beanie', category: 'Clothing packed' }] },
    ],
  },
  {
    id: 'safety',
    categories: ['First aid & Safety'],
    prompt: 'What safety gear are you carrying?',
    options: [
      { value: 'headlamp', label: 'Headlamp', rows: [{ id: 'ob-headlamp', name: 'Headlamp', category: 'First aid & Safety' }] },
      { value: 'first-aid', label: 'First aid kit', rows: [{ id: 'ob-first-aid', name: 'First aid kit', category: 'First aid & Safety' }] },
      { value: 'sat-comm', label: 'Satellite communicator', rows: [{ id: 'ob-sat-comm', name: 'Satellite communicator', category: 'First aid & Safety' }] },
      // Bear defense is safety gear, not weaponry — it lives with the first
      // aid kit so a backpacking trip (which asks no weapon question) can
      // still declare it. Both fly badly; flyIssues catches them by name.
      { value: 'bear-spray', label: 'Bear spray', rows: [{ id: 'ob-bear-spray', name: 'Bear spray', category: 'First aid & Safety' }] },
      { value: 'sidearm', label: 'Pistol', note: 'bear defense',
        rows: [{ id: 'ob-pistol', name: 'Pistol', category: 'First aid & Safety', carry: 'harness' }] },
      { value: 'fire', label: 'Fire starter', rows: [{ id: 'ob-fire-starter', name: 'Fire starter', category: 'First aid & Safety' }] },
    ],
  },
  {
    id: 'extras',
    categories: ['Luxuries'],
    prompt: 'Anything else worth the weight?',
    options: [
      { value: 'poles', label: 'Trekking poles', rows: [{ id: 'ob-poles', name: 'Trekking poles', category: 'Luxuries' }] },
      { value: 'pillow', label: 'Pillow', rows: [{ id: 'ob-pillow', name: 'Pillow', category: 'Luxuries' }] },
      { value: 'camp-shoes', label: 'Camp shoes', rows: [{ id: 'ob-camp-shoes', name: 'Camp shoes', category: 'Luxuries' }] },
      { value: 'camera', label: 'Camera', rows: [{ id: 'ob-camera', name: 'Camera', category: 'Luxuries' }] },
    ],
  },
]

// ---------- shared gear catalog ----------
// Gear anyone can look up, with the weight already on it. Seeded from the kit
// Lawrence has actually weighed and linked (2026-07-27, his ask: "they should
// be added to the shared library for any user").
//
// This is a CATALOG, not a closet. It is offered in the gear picker and
// nothing more — nobody's library is pre-filled, which is what keeps the
// 2026-07-27 rule intact: you adopt the gear you own, and a stranger never
// inherits someone else's Kifaru. Entries are objective product facts (name,
// category, weight, product page), the same standard as the scrape catalog.
//
// Ids are `gc-` slugs and become the gear id on adoption, so they must stay
// stable: rename the `name`, never the `id`.
export const GEAR_CATALOG = [
  { id: "gc-k4-5000-pack-system", name: "Exo Mtn Gear K4 5000 Pack System", category: "Backpack", weightOz: 85, url: "https://exomtngear.com/products/k4-5000-pack-system?variant=44187692466483" },
  { id: "gc-msr-reactor-stove-1-7l", name: "MSR Reactor\u00ae Stove 1.7L", category: "Cooking", weightOz: 17, url: null },
  { id: "gc-titanium-long-handle-spork", name: "Titanium Long Handle Spork", category: "Cooking", weightOz: 0.7, url: null },
  { id: "gc-inreach-mini-3-plus", name: "Garmin inReach Mini 3 Plus", category: "First aid & Safety", weightOz: 4.42, url: null },
  { id: "gc-black-diamond-carbon-trekking-poles", name: "Black Diamond Carbon Trekking Poles", category: "Luxuries", weightOz: 17, url: null },
  { id: "gc-exped-mega-pillow", name: "Exped Mega Pillow", category: "Luxuries", weightOz: 9, url: null },
  { id: "gc-helinox-chair-zero", name: "Helinox Chair Zero", category: "Luxuries", weightOz: 18, url: "https://helinox.com/products/chair-zero?avad=18967_e4de3dce9&utm_source=avantlink&utm_medium=affiliate&avad_ttl=1785162650&gad_source=1&gad_campaignid=23730987035&gbraid=0AAAABAqdgigoESP-lHrephXwwVy1hKCwz&gclid=Cj0KCQjwg5zTBhCLARIsAP2AFU77Dyy5hfByuHH_JUVkTKqKmM4wvUT5YAVtNftHEoyG9R5ijHZQbXIaAjPUEALw_wcB&variant=16664192286790" },
  { id: "gc-therm-a-rest-z-seat-pad", name: "Therm-a-rest Z-seat-pad", category: "Luxuries", weightOz: 2, url: "https://www.rei.com/product/C10933/therm-a-rest-z-seat-pad" },
  { id: "gc-backcountry-lite-ball-head", name: "Aziak Equipment Backcountry Lite Ball Head", category: "Optics/Bino Pouch", weightOz: 4.8, url: "https://aziak.com/products/backcountry-lite-ball-head?pr_prod_strat=jac&pr_rec_id=3e30245ef&pr_rec_pid=8129139769517&pr_ref_pid=8129139835053&pr_seq=uniform?variant=44326028116141" },
  { id: "gc-backcountry-lite-tripod", name: "Aziak Equipment Backcountry Lite Tripod", category: "Optics/Bino Pouch", weightOz: 18.9, url: "https://aziak.com/products/backcountry-lite-tripod" },
  { id: "gc-enclosed-binocular-chest-pack", name: "Marsupial Gear Enclosed Binocular Chest Pack", category: "Optics/Bino Pouch", weightOz: null, url: "https://www.marsupialgear.com/collections/chest-packs-and-components/products/fully-enclosed-binocular-pack" },
  { id: "gc-sig-kilo5k-rangefinder", name: "Sig Kilo5k rangefinder", category: "Optics/Bino Pouch", weightOz: null, url: "https://www.sigsauer.com/kilo5k-lrf-7x25mm-red-oled-ble-bdx-u-x-ranger-green-class-3r.html" },
  { id: "gc-swarovski-65mm-spotting-scope", name: "Swarovski 65mm Spotting scope", category: "Optics/Bino Pouch", weightOz: 49.6, url: null },
  { id: "gc-swarovski-nl-pure-10x42", name: "Swarovski NL Pure 10x42", category: "Optics/Bino Pouch", weightOz: null, url: null },
  { id: "gc-11g-tent-stakes-15x", name: "11g Tent stakes - 15x", category: "Shelter/Sleeping", weightOz: 5.8, url: null },
  { id: "gc-extra-tent-pole", name: "Extra tent pole", category: "Shelter/Sleeping", weightOz: 9, url: null },
  { id: "gc-neoair-xlite-nxt-sleeping-pad", name: "Therm-a-Rest NeoAir XLite NXT Sleeping Pad", category: "Shelter/Sleeping", weightOz: 16, url: null },
  { id: "gc-rincon-2p-dyneema-half-insert", name: "Argali Rincon 2P Dyneema Half Insert", category: "Shelter/Sleeping", weightOz: 15.8, url: "https://argalioutdoors.com/collections/argali-dyneema-tents/products/rincon-2p-dyneema-half-insert" },
  { id: "gc-rincon-2p-pro-dyneema-tent", name: "Argali Rincon 2P Pro Dyneema Tent", category: "Shelter/Sleeping", weightOz: 14.5, url: "https://argalioutdoors.com/collections/argali-dyneema-tents/products/rincon-2p-pro-dyneema-tent" },
  { id: "gc-western-mountaineering-terralite-25-sleeping-bag", name: "Western Mountaineering Terralite 25\u00b0 Sleeping Bag", category: "Shelter/Sleeping", weightOz: 29, url: "https://shop.gohunt.com/products/western-mountaineering-terralite-25-sleeping-bag?variant=8645556109426" },
  { id: "gc-big-zip-evo-reservoir-3-liters", name: "Platypus Big Zip EVO Reservoir - 3 Liters", category: "Water", weightOz: 6.5, url: "https://www.rei.com/product/145558/platypus-big-zip-evo-reservoir-3-liters" },
  { id: "gc-katadyn-befree-water-filtration-system-1-0l", name: "Katadyn BeFree Water Filtration System 1.0L", category: "Water", weightOz: 2.3, url: "https://mountainpartisan.com/products/katadyn-befree-water-filtration-system-1-0l?variant=43720300920997" },
  { id: "gc-seeker-3l", name: "HydraPak Seeker\u2122+ 3L", category: "Water", weightOz: 4.5, url: "https://www.hydrapak.com/products/seeker%E2%84%A2-3-l-1?variant=44289339719913&country=US&currency=USD&utm_medium=product_sync&utm_source=google&utm_content=sag_organic&utm_campaign=sag_organic&nbt=nb%3Aadwords%3Ag%3A23752329012%3A196207079460%3A805470481840&nb_adtype=pla&nb_kwd=&nb_ti=pla-296303633664&nb_mi=136697758&nb_pc=online&nb_pi=shopify_US_8030288609513_44289339719913&nb_ppi=296303633664&nb_placement=&nb_li_ms=&nb_lp_ms=&nb_fii=&nb_ap=&nb_mt=&tw_source=google&tw_adid=805470481840&tw_campaign=23752329012&tw_kwdid=pla-296303633664&gad_source=1&gad_campaignid=23752329012&gbraid=0AAAAADKD9hcnOxufOCjEFl95J-K_7zI5k&gclid=Cj0KCQjwg5zTBhCLARIsAP2AFU4ZG8GtLH-yxrXn0ps594gSO9CF54Zc0POKBQdN_z0LyTSYijO3cvUaArouEALw_wcB" },
  { id: "gc-ultralight-rifle-cover", name: "Ultralight rifle cover", category: "Weapon", weightOz: 1, url: null },
]

// Catalog entries the user has not already got, ranked for the picker. Match
// on name and category so "tripod" and "Optics" both find the ball head.
export function gearCatalogMatches(query, gearLibrary = []) {
  const owned = new Set(gearLibrary.map(g => g.id))
  const ownNames = new Set(gearLibrary.map(g => g.name.trim().toLowerCase()))
  const q = query.trim().toLowerCase()
  return GEAR_CATALOG
    .filter(c => !owned.has(c.id) && !ownNames.has(c.name.toLowerCase()))
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q))
    .sort((a, b) =>
      GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category) ||
      a.name.localeCompare(b.name))
}

// The label a question row is born with. A gear item still wearing it has not
// been told what it actually is — which is what the gear screen means by a
// blank slot. Built once from the catalog so the two can never drift.
const GENERIC_NAMES = new Map(
  GEAR_QUESTIONS.flatMap(q => [...(q.rows ?? []), ...q.options.flatMap(o => o.rows)])
    .map(r => [r.id, r.name]))

export function genericGearName(id) {
  return GENERIC_NAMES.get(id) ?? null
}

// What to ask about THIS trip: the camp questions always, activity questions
// only for what the trip is. Each block carries the gear you already own in
// its categories, so the questions read with your own kit ("Kifaru SuperTarp",
// not "Tent"), plus the generic options for gear you have never logged. An
// option whose slots all exist already is dropped — it would be a duplicate of
// an item listed right above it.
// What the looked-up destination implies about clothing. Deliberately two
// coarse flags — the lookup informs the question, it never answers it, so a
// wrong guess costs the user nothing but an unchecked suggestion.
const WET_DAY_SHARE = 0.4
const COLD_LOW_F = 40

export function climateHints(trip) {
  const c = trip?.place?.climate
  if (!c) return { wet: false, cold: false }
  const days = c.days ?? 0
  return {
    wet: days > 0 && typeof c.precipDays === 'number' && c.precipDays / days >= WET_DAY_SHARE,
    cold: typeof c.tempLoF === 'number' && c.tempLoF <= COLD_LOW_F,
  }
}

export function tripGearQuestions(trip, gearLibrary = []) {
  const types = tripTypes(trip)
  const owned = new Set(gearLibrary.map(g => g.id))
  const hints = climateHints(trip)
  const suggestion = o =>
    (o.wet && hints.wet) ? 'likely wet' : (o.cold && hints.cold) ? 'likely cold' : null
  return GEAR_QUESTIONS
    .filter(q => !q.when || q.when.some(t => types.includes(t)))
    .map(q => ({
      ...q,
      items: gearLibrary.filter(g => q.categories.includes(g.category)),
      options: q.options
        .filter(o => !o.rows.every(r => owned.has(r.id)))
        .map(o => ({ ...o, suggested: suggestion(o) })),
    }))
    .filter(q => q.items.length > 0 || q.options.length > 0)
}

// A trip's types, tolerating the legacy single `type` so a state that has not
// been migrated yet still asks the right questions.
export function tripTypes(trip) {
  const raw = Array.isArray(trip?.types) ? trip.types : (trip?.type ? [trip.type] : [])
  return TRIP_TYPES.filter(t => raw.includes(t))
}

// The gear slots a set of answers implies. `answers` maps question id →
// chosen values; a value is either an owned gear id or a generic option value.
// Unknown ids and values are ignored, so a stale or hand-edited answer set can
// never inject rows. Question order, deduped by id.
export function kitRows(answers, questions = GEAR_QUESTIONS) {
  const seen = new Set()
  const rows = []
  const take = row => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    rows.push(row)
  }
  for (const q of questions) {
    const picked = (answers?.[q.id] ?? [])
    const chosen = picked.filter(v => q.options.some(o => o.value === v))
    const ownedPicks = picked.filter(v => (q.items ?? []).some(g => g.id === v))
    if (chosen.length === 0 && ownedPicks.length === 0) continue
    for (const v of ownedPicks) take((q.items ?? []).find(g => g.id === v))
    for (const v of chosen) {
      for (const row of q.options.find(o => o.value === v).rows) take(row)
    }
    // Question-level rows scaffold a first kit (a shelter answer always means a
    // bag and a pad). Once the question lists gear you own, you are choosing
    // explicitly — nothing rides along uninvited.
    if (!(q.items?.length)) for (const row of q.rows ?? []) take(row)
  }
  return rows
}

// Answering builds the trip's kit AND grows the closet: slots that do not
// exist yet are added to the gear library as blank rows (name, category, no
// weight) and everything picked joins the trip, unpacked.
// `details` maps a row id to what the user said about the actual product
// while answering — a name, a product URL, a weight the page gave up. Only
// non-empty fields land, so leaving the detail row alone still produces the
// blank slot it always did.
function detailFields(d) {
  const out = {}
  if (d?.name?.trim?.()) out.name = d.name.trim()
  if (d?.url?.trim?.()) out.url = d.url.trim()
  if (typeof d?.weightOz === 'number' && Number.isFinite(d.weightOz) && d.weightOz > 0) out.weightOz = d.weightOz
  return out
}

// Rows may declare where they ride; the default is the pack.
export function applyTripKit(state, trip, answers, questions, details = {}) {
  const byId = new Map(state.gearLibrary.map(g => [g.id, g]))
  const rows = kitRows(answers, questions)
  trip.gear ??= []
  const inKit = new Set(trip.gear.map(e => e.gearId))
  for (const row of rows) {
    const fields = detailFields(details[row.id])
    if (!byId.has(row.id)) {
      const item = { id: row.id, name: row.name, category: row.category, weightOz: null, ...(row.carry ? { carry: row.carry } : {}), ...fields }
      state.gearLibrary.push(item)
      byId.set(row.id, item)
    } else if (Object.keys(fields).length) {
      // Naming it here is the same act as naming it on the gear screen.
      Object.assign(byId.get(row.id), fields)
    }
    if (!inKit.has(row.id)) {
      trip.gear.push({ gearId: row.id })
      inKit.add(row.id)
    }
  }
  return trip
}

// Taking the same kit as another trip copies the items, never the packed
// marks — a new trip starts unpacked (Lawrence, 2026-07-27).
export function copyKit(fromTrip, toTrip) {
  toTrip.gear ??= []
  const inKit = new Set(toTrip.gear.map(e => e.gearId))
  for (const entry of fromTrip.gear ?? []) {
    if (inKit.has(entry.gearId)) continue
    inKit.add(entry.gearId)
    toTrip.gear.push({ gearId: entry.gearId })
  }
  return toTrip
}

// Runs exactly once: a state that has never synced (no updatedAt stamp) and
// carries no profile belongs to a brand-new account.
export function needsProfile(state) {
  return !state.updatedAt && !state.profile
}

export function emptyProfile() {
  return { weightLbs: null, brands: [], tripTypes: [], mealStyle: null, setupAt: 0 }
}

// "Skip for now" records that we asked without answering for them: no stars
// are touched, and the welcome never returns.
export function skipProfile(state, at) {
  state.profile = { ...emptyProfile(), setupAt: at }
  return state
}

// Saving the profile is what stars food: the library reflects the brands the
// user reaches for, not Lawrence's pre-starred order. An empty pick is a
// neutral answer, not a no-op — it clears the stars.
export function applyProfile(state, { weightLbs, brands, tripTypes, mealStyle, at }) {
  const picked = BRANDS.filter(b => brands.includes(b.id)).map(b => b.id)
  for (const f of state.library) f.favorite = picked.includes(brandOf(f.id))
  state.profile = {
    weightLbs: typeof weightLbs === 'number' && weightLbs > 0 ? weightLbs : null,
    brands: picked,
    tripTypes: TRIP_TYPES.filter(t => tripTypes.includes(t)),
    mealStyle: mealStyle ?? null,
    setupAt: at,
  }
  return state
}

// Gear library seed — verbatim from Lawrence's Montana hunt sheet
// (reference/montana-gear-sheet-export.md). Weights were unfilled in the sheet;
// they stay null until weighed. name = the sheet's item (brand/model) when
// present, else its slot label.
export const GEAR_SEED = {
  version: 3,
  items: [
    { id: 'pack-maduece', name: 'MaDuece', category: 'Backpack', weightOz: null },
    { id: 'trekking-poles', name: 'Alpine Carbon Cork Trekking Poles', category: 'Luxuries', weightOz: null },
    { id: 'tent', name: 'Kifaru SuperTarp with annex', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stakes', name: '12 DAC V-Best stakes', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'ground-tarp', name: 'Tyvek ground tarp', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'sleeping-pad', name: 'Thermarest Neo Air X-Lite', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'sleeping-bag', name: 'Western Mountaineering TerraLite 25deg', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stuff-sack-tent', name: 'Stuff sack (tent)', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'stuff-sack-bag', name: 'Stuff sack (sleeping bag)', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'pillow', name: 'Exped Mega Pillow', category: 'Shelter/Sleeping', weightOz: null },
    { id: 'water-purification', name: 'SteriPen', category: 'Water', weightOz: null },
    { id: 'water-container', name: 'Platypus bladder + spare', category: 'Water', weightOz: null },
    { id: 'water-filter', name: 'BeFree Filter', category: 'Water', weightOz: null },
    { id: 'fuel', name: 'Stove fuel', category: 'Cooking', weightOz: null },
    { id: 'stove', name: 'MSR Reactor', category: 'Cooking', weightOz: null },
    { id: 'cook-pot', name: 'Reactor 1.5L pot', category: 'Cooking', weightOz: null },
    { id: 'utensils', name: 'Titanium spork', category: 'Cooking', weightOz: null },
    { id: 'bow', name: 'Mathews Lift', category: 'Weapon', weightOz: null },
    { id: 'release', name: 'Carter Like Mike release', category: 'Weapon', weightOz: null },
    { id: 'arrows', name: 'RIP TKO arrows', category: 'Weapon', weightOz: null },
    { id: 'broadheads', name: 'Ironwill + Sevr broadheads', category: 'Weapon', weightOz: null },
    { id: 'weapon-repair-kit', name: 'Weapon repair kit', category: 'Weapon', weightOz: null },
    { id: 'binoculars', name: 'Swaro NL Pure 10x42', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'bino-pouch', name: 'Marsupial Harness', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'spotting-scope', name: 'Swaro 65mm spotter', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'tripod', name: 'Slik tripod', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'license', name: 'License (digital)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'wind-check', name: 'Milkweed pods (wind check)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'range-finder', name: 'Leupold range finder', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'range-finder-battery', name: 'Range finder battery (spare)', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'sat-comm', name: 'Zoleo satellite communicator', category: 'Optics/Bino Pouch', weightOz: null },
    { id: 'knife-1', name: 'ESEE AGK', category: 'Kill kit', weightOz: null },
    { id: 'knife-2', name: 'IronWill knife', category: 'Kill kit', weightOz: null },
    { id: 'kill-kit-misc', name: 'Zip ties, gloves, sharpener, brillo pad', category: 'Kill kit', weightOz: null },
    { id: 'game-bags', name: 'Kifaru Elk Bag kit', category: 'Kill kit', weightOz: null },
    { id: 'pepper', name: 'Pepper', category: 'Kill kit', weightOz: null },
    { id: 'first-aid-kit', name: 'First aid kit (orange organizer)', category: 'First aid & Safety', weightOz: null },
    { id: 'tourniquets', name: 'Tourniquet x2', category: 'First aid & Safety', weightOz: null },
    { id: 'trauma-kit', name: 'Trauma kit (chest seal + QuikClot)', category: 'First aid & Safety', weightOz: null },
    { id: 'chapstick', name: 'Chapstick', category: 'First aid & Safety', weightOz: null },
    { id: 'lighter', name: 'Lighter', category: 'First aid & Safety', weightOz: null },
    { id: 'extra-batteries', name: 'Extra batteries', category: 'First aid & Safety', weightOz: null },
    { id: 'p-cord', name: 'P-cord', category: 'First aid & Safety', weightOz: null },
    { id: 'spare-dry-sack', name: 'Spare dry sack', category: 'First aid & Safety', weightOz: null },
    { id: 'headlamp-1', name: 'Headlamp 1', category: 'First aid & Safety', weightOz: null },
    { id: 'headlamp-2', name: 'Headlamp 2', category: 'First aid & Safety', weightOz: null },
    { id: 'toothbrush', name: 'Toothbrush', category: 'First aid & Safety', weightOz: null },
    { id: 'toothpaste', name: 'Toothpaste', category: 'First aid & Safety', weightOz: null },
    { id: 'tp-trowel', name: 'TP + trowel', category: 'First aid & Safety', weightOz: null },
    { id: 'power-packs', name: 'Power pack x2 (Nightforce + Goal Zero)', category: 'First aid & Safety', weightOz: null },
    { id: 'phone-cable', name: 'Phone charging cable', category: 'First aid & Safety', weightOz: null },
    { id: 'zoleo-cable', name: 'Zoleo charging cable', category: 'First aid & Safety', weightOz: null },
    { id: 'glock-mags', name: 'Glock 10mm x2 magazines', category: 'First aid & Safety', weightOz: null },
    { id: 'ammo-10mm', name: '10mm ammo', category: 'First aid & Safety', weightOz: null },
    { id: 'top-wicking', name: 'Sitka Subalpine lightweight top w/ bug guard', category: 'Clothing worn', weightOz: null },
    { id: 'bottoms-outer', name: 'Sitka pants', category: 'Clothing worn', weightOz: null },
    { id: 'underwear-worn', name: 'MeUndies long', category: 'Clothing worn', weightOz: null },
    { id: 'boots', name: 'Crispi Laponia', category: 'Clothing worn', weightOz: null },
    { id: 'socks-hiking', name: 'Darn Tough socks', category: 'Clothing worn', weightOz: null },
    { id: 'watch', name: 'Apple Watch Ultra 2', category: 'Clothing worn', weightOz: null },
    { id: 'hat-hiking', name: 'Hat (hiking)', category: 'Clothing worn', weightOz: null },
    { id: 'socks-backup', name: 'Darn Tough socks x6 (backup)', category: 'Clothing packed', weightOz: null },
    { id: 'underwear-packed', name: 'MeUndies x4', category: 'Clothing packed', weightOz: null },
    { id: 'puff-pants', name: 'Sitka Down pants', category: 'Clothing packed', weightOz: null },
    { id: 'puffer-top', name: 'Sitka WP Puff', category: 'Clothing packed', weightOz: null },
    { id: 'rain-top', name: 'Sitka rain top', category: 'Clothing packed', weightOz: null },
    { id: 'rain-bottom', name: 'Sitka rain pant', category: 'Clothing packed', weightOz: null },
    { id: 'mid-insulated-top', name: 'Sitka Fanatic Hoodie', category: 'Clothing packed', weightOz: null },
    { id: 'alt-mid-top', name: 'Sitka Subalpine Hoodie', category: 'Clothing packed', weightOz: null },
    { id: 'windproof-vest', name: 'Sitka vest', category: 'Clothing packed', weightOz: null },
    { id: 'mittens', name: 'First Lite down mittens', category: 'Clothing packed', weightOz: null },
    { id: 'rain-gloves', name: 'Sitka Decoy gloves', category: 'Clothing packed', weightOz: null },
    { id: 'light-gloves', name: 'REI wool light gloves', category: 'Clothing packed', weightOz: null },
    { id: 'butt-pad', name: 'Thermarest Z-rest butt pad', category: 'Luxuries', weightOz: null },
    { id: 'camp-chair', name: 'Zero Chair', category: 'Luxuries', weightOz: null },
    { id: 'lens-kit', name: 'Lens cleaning kit', category: 'Luxuries', weightOz: null },
    { id: 'headphones', name: 'AirPods', category: 'Luxuries', weightOz: null },
  ],
}

// v1 → v2 renames: applied only when the stored name is still the v1 seed name,
// so user renames always win.
const RENAMES_V2 = {
  'peak-strawberry-granola': { from: 'Peak Strawberry Granola', to: 'Peak Refuel Strawberry Granola' },
  'peak-homestyle-chicken-rice': { from: 'Peak Homestyle Chicken & Rice', to: 'Peak Refuel Homestyle Chicken & Rice' },
  'peak-beef-stroganoff': { from: 'Peak Beef Stroganoff', to: 'Peak Refuel Beef Stroganoff' },
  'peak-chicken-coconut-curry': { from: 'Peak Chicken Coconut Curry', to: 'Peak Refuel Chicken Coconut Curry' },
  'peak-beef-pasta-marinara': { from: 'Peak Beef Pasta Marinara', to: 'Peak Refuel Beef Pasta Marinara' },
  'peak-chicken-pesto-pasta': { from: 'Peak Chicken Pesto Pasta', to: 'Peak Refuel Chicken Pesto Pasta' },
  'mh-chicken-fajita-bowl-2svg': { from: 'MH Chicken Fajita Bowl (2 svg)', to: 'Mountain House Chicken Fajita Bowl (2 svg)' },
  'pro-bolt-chews': { from: 'Pro Bolt Chews', to: 'ProBar Bolt Chews' },
  'powerbar': { from: 'Powerbar', to: 'PowerBar' },
  'toasty-chee': { from: 'Toasty Chee', to: 'Lance ToastChee' },
}

// v1 generics: removed by the v2 migration unless some day still references them.
const KILLED_V2 = [
  'instant-oats-2pkg', 'dry-fruit', 'protein-powder', 'tortillas-2', 'salami-2oz',
  'choc-chip-cookies-5', 'gummy-bears-2svg', 'pb-pretzels-2h', 'trail-mix-1svg',
  'diy-no-bake-bar', 'dry-cereal-banana', 'almond-butter', 'rosemary-turkey-stick',
  'landjaeger-sticks',
]

// Gear migrations run on their own version gate, ahead of the food seed's
// early return — a current food library must never park a stale gear one.
function migrateGear(state) {
  // A backup written before gear existed has no gearLibrary at all. Import
  // and sync assign the validated blob straight to `state`, so leaving the
  // key missing crashes the gear screen on `.map` (Codex, 2026-07-27) —
  // normalize here, the one place both paths pass through.
  if (!Array.isArray(state.gearLibrary)) {
    state.gearLibrary = []
    state.gearSeedVersion = GEAR_SEED.version
    return
  }
  // Retired categories are renamed on EVERY load, not behind the version gate.
  // The gear screen groups by the live vocabulary, so an item filed under a
  // category the UI no longer offers is invisible while still counting toward
  // pack weight and packed totals — and a blob can arrive already stamped at
  // the current version carrying one (Codex, 2026-07-27). The renames are
  // idempotent string swaps, so running them always costs nothing.
  //   v2 (2026-07-25): 'Pack' → 'Backpack'
  //   v3 (2026-07-27): 'Food kit' → 'Cooking' — in an app whose other half
  //   plans food, a gear category named for food read as meals.
  // hasOwn, because a category is user-reachable data and a bare lookup would
  // find Object.prototype: an item filed under "toString" or "__proto__" would
  // otherwise have a FUNCTION assigned as its category (Codex, 2026-07-27).
  // The import gate refuses those names, but local state predates the gate.
  for (const g of state.gearLibrary) {
    if (Object.hasOwn(RETIRED_GEAR_CATEGORIES, g.category)) {
      g.category = RETIRED_GEAR_CATEGORIES[g.category]
    }
  }
  const from = state.gearSeedVersion ?? 1
  if (from >= GEAR_SEED.version) return
  if (from < 2) {
    // Where a thing belongs is a product judgment, not a rename, so it stays
    // behind the gate: re-filing it every load would overrule the user.
    for (const g of state.gearLibrary) {
      if (g.id === 'trekking-poles' && g.category === 'Backpack') g.category = 'Luxuries'
    }
  }
  state.gearSeedVersion = GEAR_SEED.version
}

// Shape migrations that answer to no version counter because they are
// idempotent conversions: a trip's single `type` becomes a `types` list,
// snack bundles fold into one flat list, and the one-day-lived onboarding
// record becomes the profile that replaced it.
function migrateShape(state) {
  for (const trip of state.trips ?? []) {
    if (trip.type === undefined) continue
    const types = Array.isArray(trip.types) ? trip.types : []
    trip.types = TRIP_TYPES.filter(t => types.includes(t) || t === trip.type)
    delete trip.type
  }
  // Snacks were once up to 3 bundles per day ([{items: [...]}]); now they are
  // one flat entry list like every other slot. Duplicate foods across the old
  // bundles merge by summing qty.
  for (const trip of state.trips ?? []) {
    for (const day of trip.days ?? []) {
      const snacks = day.meals?.snacks
      if (!Array.isArray(snacks) || !snacks.some(s => Array.isArray(s?.items))) continue
      const flat = []
      for (const e of snacks.flatMap(s => Array.isArray(s?.items) ? s.items : [s])) {
        const existing = flat.find(x => x.foodId === e.foodId)
        if (existing) existing.qty += e.qty
        else flat.push({ ...e })
      }
      day.meals.snacks = flat
    }
  }
  if (state.onboarding && !state.profile) {
    const o = state.onboarding
    state.profile = {
      weightLbs: null,
      brands: BRANDS.filter(b => (o.brands ?? []).includes(b.id)).map(b => b.id),
      tripTypes: TRIP_TYPES.filter(t => (o.tripTypes ?? []).includes(t)),
      mealStyle: null,
      setupAt: o.at ?? 0,
    }
  }
  delete state.onboarding
  return state
}

export function applySeedMigrations(state) {
  migrateShape(state)
  migrateGear(state)
  const from = state.seedVersion ?? 1
  if (from >= SEED.version) return sweepRetired(state)
  if (from < 2) {
    const referenced = new Set()
    for (const trip of state.trips) {
      for (const day of trip.days) {
        const m = day.meals
        if (!m) continue
        for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snacks']) {
          for (const e of m[k]) referenced.add(e.foodId)
        }
      }
    }
    for (const f of state.library) {
      const r = RENAMES_V2[f.id]
      if (r && f.name === r.from) f.name = r.to
    }
    state.library = state.library.filter(f => !(KILLED_V2.includes(f.id) && !referenced.has(f.id)))
  }
  if (from < 3) {
    // Cheez-It is "at best a snack" (Lawrence) — flip the hint unless the
    // user already re-hinted it themselves.
    const c = state.library.find(f => f.id === 'cheez-it-pack')
    if (c && c.slotHint === 'lunch') c.slotHint = 'snack'
  }
  if (from < 4) {
    // Only foods Lawrence actually uses (2026-07-20): drop the V2P sample-tab
    // items — unless a day still references them.
    const KILLED_V4 = ['tailwind-wilderness-athlete', 'mh-chicken-fajita-bowl-2svg',
      'cheez-it-pack', 'alpine-spiced-apple-cider', 'belvita', 'austin-pb-crackers',
      'powerbar', 'fritos-2svg']
    const referenced = new Set()
    for (const trip of state.trips) {
      for (const day of trip.days) {
        const m = day.meals
        if (!m) continue
        for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snacks']) {
          for (const e of m[k]) referenced.add(e.foodId)
        }
      }
    }
    state.library = state.library.filter(f => !(KILLED_V4.includes(f.id) && !referenced.has(f.id)))
  }
  if (from < 5) {
    // Additive: the Peak Refuel catalog scrape (2026-07-20). Only the 14 new
    // catalog ids are added — never resurrects foods the user deleted.
    const ADDED_V5 = ['peak-chicken-alfredo', 'peak-breakfast-skillet', 'peak-chicken-teriyaki-rice',
      'peak-sweet-pork-rice', 'peak-white-chicken-chili', 'peak-venison-casserole', 'peak-bison-bowl',
      'peak-buffalo-goulash', 'peak-three-bean-chili-mac', 'peak-mountain-berry-granola',
      'peak-butternut-dal-bhat', 'peak-biscuits-gravy', 'peak-peaches-oats', 'peak-bison-ranch-mashers']
    const have = new Set(state.library.map(f => f.id))
    for (const f of SEED.foods) {
      if (ADDED_V5.includes(f.id) && !have.has(f.id)) state.library.push({ ...f, favorite: false })
    }
  }
  if (from < 6) {
    // Additive: Skratch Labs Energy Chews (Lawrence's source, 2026-07-20).
    if (!state.library.some(f => f.id === 'skratch-energy-chews')) {
      const f = SEED.foods.find(x => x.id === 'skratch-energy-chews')
      state.library.push({ ...f, favorite: false })
    }
  }
  if (from < 7) {
    // Additive: Skratch hydration mix + Goldbears (Lawrence's sources).
    for (const id of ['skratch-hydration-mix', 'haribo-goldbears-oz']) {
      if (!state.library.some(f => f.id === id)) {
        state.library.push({ ...SEED.foods.find(x => x.id === id), favorite: false })
      }
    }
  }
  if (from < 8) {
    // Stamp prep:'cook' on hot-water meals users already have (only where the
    // field is unset, so user-set values win).
    for (const f of state.library) {
      const seeded = SEED.foods.find(x => x.id === f.id)
      if (seeded?.prep === 'cook' && f.prep === undefined) f.prep = 'cook'
    }
  }
  if (from < 9) {
    // Full reset (Lawrence 2026-07-20: "one wipe of the locally stored memory
    // of the foods … and a fully wipe of the meal plans"). The library
    // rebuilds from seed exactly — this is the one migration allowed to drop
    // user foods and resurrect past deletions — and every planned day is
    // cleared so stale drafts can't keep old items alive. Trips, gear, and
    // gear packing survive; redrafting stays a user action.
    state.library = SEED.foods.map(f => ({ favorite: false, ...f }))
    for (const trip of state.trips) {
      for (const day of trip.days) {
        delete day.meals
        delete day.packed
      }
    }
  }
  // v10 (Jack Link's per-oz) was superseded within the day by v11 — its
  // additive block is gone; the item retires via the standing sweep below.
  if (from < 11) {
    // Additive: FATTY Original 2 oz stick (Lawrence 2026-07-21, his brand)
    // — the protein-dense snack the library lacked.
    if (!state.library.some(f => f.id === 'fatty-original-2oz')) {
      state.library.push({ ...SEED.foods.find(x => x.id === 'fatty-original-2oz'), favorite: false })
    }
  }
  if (from < 12) {
    // Additive: Stowaway Gourmet + Packit Gourmet single-meal catalogs
    // (2026-07-26 scrape) — never resurrects foods the user deleted.
    const have = new Set(state.library.map(f => f.id))
    for (const f of SEED.foods) {
      if ((f.id.startsWith('stowaway-') || f.id.startsWith('packit-')) && !have.has(f.id)) {
        state.library.push({ ...f, favorite: false })
      }
    }
  }
  if (from < 13) {
    // Additive: Chomps Smoky BBQ Beef stick — never resurrects a deletion.
    const have = new Set(state.library.map(f => f.id))
    for (const f of SEED.foods) {
      if (f.id.startsWith('chomps-') && !have.has(f.id)) state.library.push({ ...f, favorite: false })
    }
  }
  return sweepRetired(state, () => { state.seedVersion = SEED.version })
}

// Standing sweep (every load, not version-gated): retired sample-tab items
// disappear once nothing references them — unless the user starred them,
// which is an explicit keep. Never touches user-created foods.
function sweepRetired(state, after) {
  const RETIRED = new Set([
    'instant-oats-2pkg', 'dry-fruit', 'protein-powder', 'tortillas-2', 'salami-2oz',
    'choc-chip-cookies-5', 'gummy-bears-2svg', 'pb-pretzels-2h', 'trail-mix-1svg',
    'diy-no-bake-bar', 'dry-cereal-banana', 'almond-butter', 'rosemary-turkey-stick',
    'landjaeger-sticks', 'tailwind-wilderness-athlete', 'mh-chicken-fajita-bowl-2svg',
    'cheez-it-pack', 'alpine-spiced-apple-cider', 'belvita', 'austin-pb-crackers',
    'powerbar', 'fritos-2svg', 'toasty-chee', 'jack-links-original-oz',
  ])
  const stillReferenced = new Set()
  for (const trip of state.trips) {
    for (const day of trip.days) {
      const m = day.meals
      if (!m) continue
      for (const k of ['electrolytes', 'breakfast', 'lunch', 'dinner', 'snacks']) {
        for (const e of m[k]) stillReferenced.add(e.foodId)
      }
    }
  }
  state.library = state.library.filter(f =>
    !(RETIRED.has(f.id) && !stillReferenced.has(f.id) && f.favorite !== true))
  if (after) after()
  return state
}
