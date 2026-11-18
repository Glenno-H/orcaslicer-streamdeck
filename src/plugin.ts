import streamDeck from "@elgato/streamdeck";

import { CommandAction, CustomAction } from "./actions";
import { categories, dedicated } from "./commands";

streamDeck.logger.setLevel("info");

for (const category of categories) streamDeck.actions.registerAction(CommandAction.forCategory(category.id));
for (const action of dedicated) streamDeck.actions.registerAction(CommandAction.dedicatedTo(action.command));
streamDeck.actions.registerAction(new CustomAction());

streamDeck.connect();
