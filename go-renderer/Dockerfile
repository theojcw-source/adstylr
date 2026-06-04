FROM golang:1.26-alpine AS build

WORKDIR /src
COPY go.mod ./
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /styleforge-server ./cmd/styleforge-server

FROM alpine:3.22

RUN adduser -D -H styleforge
USER styleforge

COPY --from=build /styleforge-server /styleforge-server

ENV PORT=8080
EXPOSE 8080

CMD ["/styleforge-server"]
