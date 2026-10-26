import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_WEEK_HOURS, type DayHours, type DayKey } from "@/constants/opening-hours";
import { OpeningHoursCopy } from "./index";

const toast = vi.hoisted(() => ({ success: vi.fn(), info: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const onCopy = vi.fn();

function week(patch: Partial<Record<DayKey, Partial<DayHours>>>): DayHours[] {
  return EMPTY_WEEK_HOURS.map((day) => ({ ...day, ...patch[day.day] }));
}

const segunda = { isOpen: true, openTime: "12:00", closeTime: "20:00" };

function renderCopy(hours: DayHours[]) {
  return render(
    <OpeningHoursCopy hours={hours} onCopy={onCopy}>
      <div>grade</div>
    </OpeningHoursCopy>,
  );
}

const trazer = () => screen.getByRole("button", { name: /trazer horário/i });

beforeEach(() => vi.clearAllMocks());

describe("Trazer horário (LDMF-351)", () => {
  it("sem nenhum dia com horário o botão fica desabilitado", () => {
    renderCopy(EMPTY_WEEK_HOURS);
    expect(trazer()).toBeDisabled();
  });

  it("com só um dia com horário, copia direto para os marcados vazios", () => {
    renderCopy(
      week({
        mon: segunda,
        tue: { isOpen: true },
        wed: { isOpen: true },
        thu: { isOpen: true },
        fri: { isOpen: true },
      }),
    );
    fireEvent.click(trazer());

    expect(onCopy).toHaveBeenCalledWith("mon", ["tue", "wed", "thu", "fri"]);
    expect(toast.success).toHaveBeenCalledWith(
      "Horário de Segunda trazido para 4 dias.",
    );
    // Continua na grade, sem modo de seleção.
    expect(screen.getByText("grade")).toBeInTheDocument();
  });

  it("com só um dia e nenhum marcado, pede para marcar", () => {
    renderCopy(week({ wed: segunda }));
    fireEvent.click(trazer());

    expect(onCopy).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith(
      "Marque os dias que vão receber o horário de Quarta.",
    );
  });

  describe("com mais de um dia com horário", () => {
    const hours = week({
      mon: segunda,
      tue: { isOpen: true },
      sat: { isOpen: true, openTime: "18:00", closeTime: "23:30" },
    });

    it("abre a seleção com a segunda como origem e os vazios já marcados", () => {
      renderCopy(hours);
      fireEvent.click(trazer());

      expect(screen.queryByText("grade")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Copiar de" })).toHaveTextContent(
        "Segunda",
      );
      expect(screen.getByRole("checkbox", { name: "Trazer para Terça" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Trazer para Sábado" })).not.toBeChecked();
      // A origem não tem checkbox.
      expect(screen.queryByRole("checkbox", { name: "Trazer para Segunda" })).toBeNull();
      expect(screen.getByText("18:00 às 23:30")).toBeInTheDocument();
    });

    it("deixa escolher dia já preenchido e aplica", () => {
      renderCopy(hours);
      fireEvent.click(trazer());
      fireEvent.click(screen.getByRole("checkbox", { name: "Trazer para Sábado" }));
      fireEvent.click(screen.getByRole("button", { name: "Aplicar a 2 dias" }));

      expect(onCopy).toHaveBeenCalledWith("mon", ["tue", "sat"]);
      expect(screen.getByText("grade")).toBeInTheDocument();
    });

    it("sem dia escolhido não aplica", () => {
      renderCopy(hours);
      fireEvent.click(trazer());
      fireEvent.click(screen.getByRole("checkbox", { name: "Trazer para Terça" }));

      expect(screen.getByRole("button", { name: "Escolha os dias" })).toBeDisabled();
    });

    it("cancelar volta para a grade sem copiar", () => {
      renderCopy(hours);
      fireEvent.click(trazer());
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(onCopy).not.toHaveBeenCalled();
      expect(screen.getByText("grade")).toBeInTheDocument();
    });
  });
});
