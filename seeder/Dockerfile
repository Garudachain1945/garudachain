FROM golang:1.22-alpine AS builder
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /garuda-seeder ./cmd/garuda-seeder

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /garuda-seeder /usr/local/bin/garuda-seeder
EXPOSE 53/udp 53/tcp 8080
ENTRYPOINT ["/usr/local/bin/garuda-seeder"]
