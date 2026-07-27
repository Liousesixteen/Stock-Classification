// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyDetails } from "@/components/workbench/CompanyDetails";

describe("CompanyDetails", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows an actionable error instead of an endless loading state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: "公司资料服务暂时不可用" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )));
    vi.stubGlobal("fetch", fetchMock);

    render(createElement(CompanyDetails, {
      stockCode: "000166",
      selectedCategoryId: null,
      refreshKey: 0,
      onChanged: vi.fn(),
    }));

    expect(await screen.findByRole("alert")).toHaveTextContent("公司详情加载失败");
    expect(screen.getByRole("alert")).toHaveTextContent("公司资料服务暂时不可用");
    expect(screen.queryByText("加载公司详情中...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
