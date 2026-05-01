package main

import "testing"

func TestAddPasses(t *testing.T) {
	if add(2, 3) != 5 {
		t.Fatalf("expected 5")
	}
}

func TestAddFails(t *testing.T) {
	if add(2, 3) != 6 {
		t.Fatalf("expected 6, got %d", add(2, 3))
	}
}
