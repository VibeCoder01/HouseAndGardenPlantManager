import { ItemView, WorkspaceLeaf } from "obsidian";
import type HouseplantGardenPlugin from "../main";
import {
  computeMonthlyCareSchedule,
  type MonthlySchedule,
} from "../features/calendar";
import { differenceInDays, parseYMD, startOfDay } from "../utils/dates";
import { VIEW_DASHBOARD, VIEW_DASHBOARD_NAME } from "../constants";
import { showUpcomingTaskToast } from "../components/alerts/toast";
import {
  findTrendForMonth,
  parseLocationCoordinates,
  type SeasonalTrendPoint,
} from "../services/climate/OpenMeteoClient";
import type { Plant } from "../types";

export default class DashboardView extends ItemView {
  private rendering = false;
  private filterPlantId: string | null = null;
  private filterLocation: string | null = null;
  private schedule: MonthlySchedule[] = [];
  private plants: Plant[] = [];
  private climateByLocation = new Map<string, SeasonalTrendPoint[]>();
  private scheduleContainer: HTMLElement | null = null;
  private readonly notified = new Set<string>();

  constructor(public leaf: WorkspaceLeaf, private readonly plugin: HouseplantGardenPlugin) {
    super(leaf);
    this.icon = "calendar";
    this.navigation = true;
  }

  getViewType(): string {
    return VIEW_DASHBOARD;
  }

  getDisplayText(): string {
    return VIEW_DASHBOARD_NAME;
  }

  async onOpen() {
    await this.render();
  }

  async onClose() {}

  requestRender() {
    void this.render();
  }

  private async render() {
    if (this.rendering) return;
    this.rendering = true;
    try {
      const container = this.containerEl;
      container.empty();
      container.addClass("pgm-dashboard");
      container.createEl("h3", { text: "Care dashboard" }).addClass("pgm-heading");

      if (!this.plugin.index) {
        container.createSpan({ text: "Plant index is still initialising." });
        return;
      }

      const { schedule, plants, climate } = await this.loadData();
      this.schedule = schedule;
      this.plants = plants;
      this.climateByLocation = climate;
      this.scheduleContainer = null;

      this.renderFilters(container);
      this.scheduleContainer = container.createDiv({ cls: "pgm-dashboard-schedule" });
      this.renderSchedule();
      this.fireUpcomingToasts(schedule);
    } finally {
      this.rendering = false;
    }
  }

  private async loadData(): Promise<{
    schedule: MonthlySchedule[];
    plants: Plant[];
    climate: Map<string, SeasonalTrendPoint[]>;
  }> {
    const idx = await this.plugin.index!.build();
    const plants = Object.values(idx.plants)
      .map((entry) => entry.data)
      .sort((a, b) => a.common.localeCompare(b.common));
    const schedule = computeMonthlyCareSchedule(plants, {
      months: 6,
      winterMonths: this.plugin.settings.winter_months_uk,
    });

    const climate = await this.fetchClimate(plants);
    return { schedule, plants, climate };
  }

  private async fetchClimate(plants: Plant[]): Promise<Map<string, SeasonalTrendPoint[]>> {
    const map = new Map<string, SeasonalTrendPoint[]>();
    const uniqueLocations = Array.from(
      new Set(
        plants
          .map((plant) => plant.location?.trim())
          .filter((location): location is string => Boolean(location)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    await Promise.all(
      uniqueLocations.map(async (location) => {
        const coords = parseLocationCoordinates(location);
        if (!coords) {
          map.set(location, []);
          return;
        }
        try {
          const trends = await this.plugin.climateClient.getSeasonalTrends(
            coords.latitude,
            coords.longitude,
          );
          map.set(location, trends);
        } catch (error) {
          console.error("Failed to load climate trends", error);
          map.set(location, []);
        }
      }),
    );
    return map;
  }

  private renderFilters(container: HTMLElement) {
    const filters = container.createDiv({ cls: "pgm-dashboard-filters" });

    const plantSelect = filters.createEl("select", { cls: "pgm-dashboard-filter" });
    plantSelect.createEl("option", { value: "", text: "All plants" });
    for (const plant of this.plants) {
      plantSelect.createEl("option", {
        value: plant.id,
        text: plant.common,
      });
    }
    if (this.filterPlantId) {
      plantSelect.value = this.filterPlantId;
    }
    plantSelect.addEventListener("change", () => {
      this.filterPlantId = plantSelect.value || null;
      this.renderSchedule();
    });

    const locationSelect = filters.createEl("select", { cls: "pgm-dashboard-filter" });
    locationSelect.createEl("option", { value: "", text: "All locations" });
    const locations = Array.from(
      new Set(this.plants.map((plant) => plant.location).filter((loc) => Boolean(loc?.trim()))),
    ).sort((a, b) => a.localeCompare(b));
    for (const location of locations) {
      const option = locationSelect.createEl("option", { value: location, text: location });
      if (this.filterLocation === location) {
        option.selected = true;
      }
    }
    locationSelect.addEventListener("change", () => {
      this.filterLocation = locationSelect.value || null;
      this.renderSchedule();
    });
  }

  private renderSchedule() {
    const container = this.scheduleContainer;
    if (!container) return;
    container.empty();

    let renderedMonths = 0;
    for (const month of this.schedule) {
      const monthSection = this.renderMonth(container, month);
      if (monthSection) {
        renderedMonths += 1;
      }
    }

    if (renderedMonths === 0) {
      container.createDiv({
        text: "No tasks match the current filters for the upcoming months.",
        cls: "pgm-empty",
      });
    }
  }

  private renderMonth(parent: HTMLElement, month: MonthlySchedule): HTMLElement | null {
    const [, monthText] = month.month.split("-");
    const monthNumber = Number(monthText);
    const filteredPlants = month.plants.filter((item) => {
      if (this.filterPlantId && item.plantId !== this.filterPlantId) return false;
      if (this.filterLocation && item.location !== this.filterLocation) return false;
      return true;
    });

    if (!filteredPlants.length) {
      return null;
    }

    const section = parent.createDiv({ cls: "pgm-month" });
    const heading = section.createEl("h4", { text: formatMonthLabel(month.month) });
    heading.addClass("pgm-month-heading");

    const table = section.createEl("table", { cls: "pgm-month-table" });
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    headerRow.createEl("th", { text: "Plant" });
    headerRow.createEl("th", { text: "Location" });
    headerRow.createEl("th", { text: "Tasks" });

    const tbody = table.createEl("tbody");
    for (const plantSchedule of filteredPlants) {
      const row = tbody.createEl("tr");
      row.createEl("td", { text: plantSchedule.plantName, cls: "pgm-month-plant" });
      row.createEl("td", { text: plantSchedule.location || "—", cls: "pgm-month-location" });
      const tasksCell = row.createEl("td", { cls: "pgm-month-tasks" });

      for (const task of plantSchedule.tasks) {
        const taskBlock = tasksCell.createDiv({ cls: "pgm-task" });
        taskBlock.createEl("strong", { text: titleCase(task.action) });
        if (task.dueDates.length) {
          taskBlock.createSpan({ text: task.dueDates.join(", "), cls: "pgm-task-dates" });
        }
        if (task.note) {
          taskBlock.createSpan({ text: task.note, cls: "pgm-task-note" });
        }
        if (task.intensity && task.intensity !== "normal") {
          taskBlock.createSpan({ text: `(${task.intensity})`, cls: "pgm-task-intensity" });
        }
      }

      const climate = this.climateByLocation.get(plantSchedule.location);
      const trend = climate ? findTrendForMonth(climate, monthNumber) : undefined;
      if (trend && (trend.temperatureC !== undefined || trend.precipitationMm !== undefined)) {
        const climateMeta = tasksCell.createDiv({ cls: "pgm-task-climate" });
        const parts: string[] = [];
        if (typeof trend.temperatureC === "number") {
          parts.push(`Avg temp: ${trend.temperatureC}°C`);
        }
        if (typeof trend.precipitationMm === "number") {
          parts.push(`Rain: ${trend.precipitationMm} mm`);
        }
        climateMeta.setText(parts.join(" • "));
      }
    }

    return section;
  }

  private fireUpcomingToasts(schedule: MonthlySchedule[]) {
    const today = startOfDay(new Date());

    for (const month of schedule) {
      for (const plant of month.plants) {
        for (const task of plant.tasks) {
          for (const due of task.dueDates) {
            const dueDate = parseYMD(due);
            if (!dueDate) continue;
            const diff = differenceInDays(dueDate, today);
            if (diff < 0 || diff > 3) continue;
            const key = `${plant.plantId}:${task.action}:${due}`;
            if (this.notified.has(key)) continue;
            this.notified.add(key);
            showUpcomingTaskToast(plant.plantName, task.action, due);
          }
        }
      }
    }
  }
}

function titleCase(action: string): string {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const monthIndex = Number(month);
  const date = new Date(Number(year), monthIndex - 1, 1);
  return date.toLocaleString(undefined, { month: "long", year: "numeric" });
}
