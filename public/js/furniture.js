/**
 * Furniture Catalog & Placement Module
 * Categories: living, bedroom, kitchen, bathroom
 * Items with name, dimensions (meters), color for 2D/3D rendering
 */
var FurnitureCatalog = (function() {

  var catalog = {
    living: {
      name: "\u0413\u043E\u0441\u0442\u0438\u043D\u0430\u044F",
      items: [
        { id: "sofa", name: "\u0414\u0438\u0432\u0430\u043D", width: 2.0, depth: 0.9, height: 0.85, color: "#6B7280" },
        { id: "armchair", name: "\u041A\u0440\u0435\u0441\u043B\u043E", width: 0.9, depth: 0.9, height: 0.85, color: "#7C8594" },
        { id: "coffee_table", name: "\u0416\u0443\u0440\u043D\u0430\u043B\u044C\u043D\u044B\u0439 \u0441\u0442\u043E\u043B\u0438\u043A", width: 1.2, depth: 0.6, height: 0.45, color: "#A78B6B" },
        { id: "tv_stand", name: "\u0422\u0412 \u0442\u0443\u043C\u0431\u0430", width: 1.5, depth: 0.45, height: 0.55, color: "#4B5563" },
        { id: "bookshelf", name: "\u041A\u043D\u0438\u0436\u043D\u044B\u0439 \u0448\u043A\u0430\u0444", width: 0.8, depth: 0.35, height: 1.8, color: "#92764A" }
      ]
    },
    bedroom: {
      name: "\u0421\u043F\u0430\u043B\u044C\u043D\u044F",
      items: [
        { id: "bed_double", name: "\u041A\u0440\u043E\u0432\u0430\u0442\u044C 2-\u0441\u043F", width: 1.8, depth: 2.1, height: 0.55, color: "#8B7355" },
        { id: "bed_single", name: "\u041A\u0440\u043E\u0432\u0430\u0442\u044C 1-\u0441\u043F", width: 0.9, depth: 2.0, height: 0.55, color: "#8B7355" },
        { id: "wardrobe", name: "\u0428\u043A\u0430\u0444", width: 1.5, depth: 0.6, height: 2.2, color: "#6B5B4D" },
        { id: "nightstand", name: "\u0422\u0443\u043C\u0431\u043E\u0447\u043A\u0430", width: 0.5, depth: 0.4, height: 0.55, color: "#A08060" },
        { id: "dresser", name: "\u041A\u043E\u043C\u043E\u0434", width: 1.0, depth: 0.5, height: 0.9, color: "#7A6A5A" }
      ]
    },
    kitchen: {
      name: "\u041A\u0443\u0445\u043D\u044F",
      items: [
        { id: "dining_table", name: "\u041E\u0431\u0435\u0434\u0435\u043D\u043D\u044B\u0439 \u0441\u0442\u043E\u043B", width: 1.4, depth: 0.8, height: 0.75, color: "#B8956A" },
        { id: "chair", name: "\u0421\u0442\u0443\u043B", width: 0.45, depth: 0.45, height: 0.85, color: "#8B7355" },
        { id: "fridge", name: "\u0425\u043E\u043B\u043E\u0434\u0438\u043B\u044C\u043D\u0438\u043A", width: 0.6, depth: 0.65, height: 1.8, color: "#D1D5DB" },
        { id: "stove", name: "\u041F\u043B\u0438\u0442\u0430", width: 0.6, depth: 0.6, height: 0.85, color: "#E5E7EB" },
        { id: "sink_kitchen", name: "\u041C\u043E\u0439\u043A\u0430", width: 0.6, depth: 0.5, height: 0.85, color: "#9CA3AF" }
      ]
    },
    bathroom: {
      name: "\u0412\u0430\u043D\u043D\u0430\u044F",
      items: [
        { id: "bathtub", name: "\u0412\u0430\u043D\u043D\u0430", width: 0.7, depth: 1.7, height: 0.6, color: "#F3F4F6" },
        { id: "shower", name: "\u0414\u0443\u0448\u0435\u0432\u0430\u044F", width: 0.9, depth: 0.9, height: 2.0, color: "#E5E7EB" },
        { id: "toilet", name: "\u0423\u043D\u0438\u0442\u0430\u0437", width: 0.4, depth: 0.65, height: 0.4, color: "#F9FAFB" },
        { id: "sink_bath", name: "\u0420\u0430\u043A\u043E\u0432\u0438\u043D\u0430", width: 0.6, depth: 0.45, height: 0.85, color: "#F3F4F6" },
        { id: "washing_machine", name: "\u0421\u0442\u0438\u0440\u0430\u043B\u044C\u043D\u0430\u044F", width: 0.6, depth: 0.55, height: 0.85, color: "#D1D5DB" }
      ]
    }
  };

  function getCategories() {
    var cats = [];
    for (var key in catalog) {
      cats.push({ id: key, name: catalog[key].name });
    }
    return cats;
  }

  function getItems(categoryId) {
    if (!catalog[categoryId]) return [];
    return catalog[categoryId].items.slice();
  }

  function getItem(itemId) {
    for (var key in catalog) {
      var items = catalog[key].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i].id === itemId) return Object.assign({}, items[i]);
      }
    }
    return null;
  }

  function getCategoryName(categoryId) {
    return catalog[categoryId] ? catalog[categoryId].name : "";
  }

  return {
    getCategories: getCategories,
    getItems: getItems,
    getItem: getItem,
    getCategoryName: getCategoryName
  };
})();

window.FurnitureCatalog = FurnitureCatalog;
