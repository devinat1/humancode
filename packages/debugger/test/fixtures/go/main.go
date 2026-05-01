package main

import "fmt"

func add(a, b int) int {
	sum := a + b
	return sum
}

func main() {
	x := 2
	y := 3
	result := add(x, y)
	fmt.Println("result:", result)
}
