import {SettingsConfig} from "data";
import Logger from "./logger";
import DataStore from "./datastore";
import Events from "./emitter";
import DiscordModules from "./discordmodules";
import Strings from "./strings";

export default new class SettingsManager {

    constructor() {
        this.state = {};
        this.collections = [];
        this.panels = [];
        this.registerCollection("settings", "Settings", SettingsConfig);
        this.updateStrings = this.updateStrings.bind(this);
    }

    initialize() {
        this.loadSettings();
        this.updateStrings();
        Events.on("strings-updated", this.updateStrings);
        // this.patchSections();
    }

    registerCollection(id, name, settings, button = null) {
        if (this.collections.find(c => c.id == id)) return Logger.error("Settings", "Already have a collection with id " + id);
        this.collections.push({
            type: "collection",
            id: id,
            name: name,
            settings: settings,
            button: button
        });
        this.setup();
        this.updateStrings();
    }

    removeCollection(id) {
        const location = this.collections.findIndex(c => c.id == id);
        if (!location < 0) return Logger.error("Settings", "No collection with id " + id);
        this.collections.splice(location, 1);
    }

    // TODO: Move this to SettingsRenderer and also add a registerContentPanel
    registerPanel(id, name, options) {
        if (this.panels.find(p => p.id == id)) return Logger.error("Settings", "Already have a panel with id " + id);
        const {element, onClick, order = 1} = options;
        const section = {id, order, label: name, section: id};
        if (onClick) section.clickListener = onClick;
        if (element) section.element = element instanceof DiscordModules.React.Component ? () => DiscordModules.React.createElement(element, {}) : typeof(element) == "function" ? element : () => element;
        this.panels.push(section);
    }

    removePanel(id) {
        const location = this.panels.findIndex(c => c.id == id);
        if (!location < 0) return Logger.error("Settings", "No collection with id " + id);
        this.panels.splice(location, 1);
    }

    getPath(path, collectionId = "", categoryId = "") {
        const collection = path.length == 3 ? path[0] : collectionId;
        const category = path.length == 3 ? path[1] : path.length == 2 ? path[0] : categoryId;
        const setting = path[path.length - 1];
        return {collection, category, setting};
    }

    setup() {
        for (let c = 0; c < this.collections.length; c++) {
            const collection = this.collections[c];
            const categories = this.collections[c].settings;
            if (!this.state[collection.id]) this.state[collection.id] = {};
            for (let cc = 0; cc < categories.length; cc++) {
                const category = categories[cc];
                if (category.type != "category") {if (!this.state[collection.id].hasOwnProperty(category.id)) this.state[collection.id][category.id] = category.value;}
                else {
                    if (!this.state[collection.id].hasOwnProperty(category.id)) this.state[collection.id][category.id] = {};
                    for (let s = 0; s < category.settings.length; s++) {
                        const setting = category.settings[s];
                        if (!this.state[collection.id][category.id].hasOwnProperty(setting.id)) this.state[collection.id][category.id][setting.id] = setting.value;
                        if (setting.enableWith) {
                            const path = this.getPath(setting.enableWith.split("."), collection.id, category.id);
                            if (setting.hasOwnProperty("disabled")) continue;
                            Object.defineProperty(setting, "disabled", {
                                get: () => {
                                    return !this.state[path.collection][path.category][path.setting];
                                }
                            });
                        }

                        if (setting.disableWith) {
                            const path = this.getPath(setting.disableWith.split("."), collection.id, category.id);
                            if (setting.hasOwnProperty("disabled")) continue;
                            Object.defineProperty(setting, "disabled", {
                                get: () => {
                                    return this.state[path.collection][path.category][path.setting];
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    saveSettings() {
        DataStore.setData("settings", this.state);
    }

    loadSettings() {
        const previousState = DataStore.getData("settings");
        if (!previousState) return this.saveSettings();
        for (const collection in this.state) {
            if (!previousState[collection]) Object.assign(previousState, {[collection]: this.state[collection]});
            for (const category in this.state[collection]) {
                if (!previousState[collection][category]) Object.assign(previousState[collection], {[category]: this.state[collection][category]});
                for (const setting in this.state[collection][category]) {
                    if (previousState[collection][category][setting] == undefined) continue;
                    this.state[collection][category][setting] = previousState[collection][category][setting];
                }
            }
        }

        this.saveSettings(); // in case new things were added
    }

    onSettingChange(collection, category, id, value) {
        this.state[collection][category][id] = value;
        Events.dispatch("setting-updated", collection, category, id, value);
        this.saveSettings();
    }

    getSetting(collection, category, id) {
        if (arguments.length == 2) return this.collections[0].find(c => c.id == arguments[0]).settings.find(s => s.id == arguments[1]);
        return this.collections.find(c => c.id == collection).find(c => c.id == category).settings.find(s => s.id == id);
    }

    get(collection, category, id) {
        if (arguments.length == 2) {
            id = category;
            category = collection;
            collection = "settings";
        }
        if (!this.state[collection] || !this.state[collection][category]) return false;
        return this.state[collection][category][id];
    }

    set(collection, category, id, value) {
        if (arguments.length == 3) {
            value = id;
            id = category;
            category = collection;
            collection = "settings";
        }
        return this.onSettingChange(collection, category, id, value);
    }

    on(collection, category, identifier, callback) {
        const handler = (col, cat, id, value) => {
            if (col !== collection || cat !== category || id !== identifier) return;
            callback(value);
        };
        Events.on("setting-updated", handler);
        return () => {Events.off("setting-updated", handler);};
    }

    updateStrings() {
        // Update settings collections
        for (let c = 0; c < this.collections.length; c++) {
            const collection = this.collections[c];
            const CS = Strings.Collections[collection.id];
            if (!CS) continue;
            collection.name = CS.name || collection.name;
            const categories = this.collections[c].settings;
            for (let cat = 0; cat < categories.length; cat++) {
                const category = categories[cat];
                const CatStr = CS[category.id];
                if (!CatStr) continue;
                category.name = CatStr.name || category.name;
                for (let s = 0; s < category.settings.length; s++) {
                    const setting = category.settings[s];
                    const SetStr = CatStr[setting.id];
                    if (!SetStr) continue;
                    setting.name = SetStr.name || setting.name;
                    setting.note = SetStr.note || setting.note;
                }
            }
        }

        // Update panel labels
        for (let p = 0; p < this.panels.length; p++) {
            const panel = this.panels[p];
            const Str = Strings.Panels[panel.id];
            panel.label = Str || panel.label;
        }
    }
};