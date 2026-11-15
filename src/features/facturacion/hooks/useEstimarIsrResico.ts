import { useMutation } from "@tanstack/react-query";
import { evaluarIsrResico } from "../services/evaluarIsrResico";

export function useEstimarIsrResico() {
  return useMutation({ mutationFn: evaluarIsrResico });
}
